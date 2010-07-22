var sys = require("sys");
var path = require("path");
var events = require('events');

/**
 * Chunk object
 * @param {HStream} hStream Operating HStream
 * @param {Chunk} parent Parent chunk
 * @param {Integer} id Unique id
 * @returns {Chunk}
 */
function Chunk(hStream, parent, id) {
    this.hStream = hStream;
    this.parent = parent;
    this.id = id;
    this.data = undefined;
    
    this.bounded = parent ? (parent.bounded || 
            (typeof parent.lambda === 'function')) :
            false;
    this.lambda = undefined;
}

/**
 * Maps subchunk.
 * @param id
 * @returns {Chunk} subchunk
 */
Chunk.prototype.map = function() {
    if (Array.isArray(this.data) && this.data.length > 0) {
        var id = this.data[this.data.length-1].id + 1;
    } else {
        this.data = [];
        var id = 0;
    }
    var ingest = new Chunk(this.hStream, this, id);
    this.data.push(ingest);
    
    return ingest;
};

/**
 * Set end marker to chunk's stream.
 */
Chunk.prototype.end = function() {
    if (!this.data) {
        this.data = [];
    }
    
    var ingest = new Chunk(this.hStream, this, null);
    this.data.push(ingest);
    
    ingest.__poll();
};

/**
 * Write data to chunk.
 * @param {String} data 
 */
Chunk.prototype.write = function(data) {
    // Check for lambda
    if (!this.lambda) {
        this.data = data;
        this.__poll();
    } else {
        // Lambda exists
        var lambda = this.lambda;
        this.lambda = undefined;
        var self = this;
        lambda(data, function(data) {
            self.write(data);
        });
    }
};

/**
 * Polls chunk. At this point chunk data can be only string.
 */
Chunk.prototype.__poll = function() {
    if (this.bounded) {
        // Chunk bounded. So bounded chunks always has parent
        
        // Now check completion of chunk's stream
        if (this.parent.data.every(function(chunk) {
            // Ok if chunk is end marker or data is String
            
            return ((chunk.id === null && chunk.data === undefined) || 
                    (typeof chunk.data === 'string'));
        }) && this.parent.data[this.parent.data.length-1].id === null) {
            
            // If Chunk's data completed - collect and write to parent.
            this.parent.write(this.parent.data.reduce(function(acc, chunk) {
                return (chunk.id === null) ? acc :
                    acc + chunk.data;
            }, ""));
        }
    } else {
         // Chunk not bounded. 
        if (this.__isLead()) {
            this.hStream.__poll(this);
        }
    }
};

/**
 * Check is chunk lies in lead of all streams in hierarchy 
 * @returns true or false
 */
Chunk.prototype.__isLead = function() {
    if (!this.parent) { 
        // Root chunk
        return true;
    }
    
    if (this.parent.data[0].id === this.id) {
        return this.parent.__isLead();
    }
};

Chunk.prototype.__getId = function() {
    if (!this.parent) { 
        // Root chunk
        return "root";
    }
    
    return this.parent.__getId() + "." + this.id;
};



/**
 * HStream
 * @returns {HStream}
 */
function HStream() {
    events.EventEmitter.call(this);
    this.root = new Chunk(this, undefined, undefined);
    this.closed = false;
}
sys.inherits(HStream, events.EventEmitter);
exports.HStream = HStream;

/**
 * Polls HStream from given chunk. Chunk always lead.
 * 
 * @param {Chunk} chunk
 */
HStream.prototype.__poll = function(chunk) {
    // Check for closed state
    if (this.closed) {
        return;
    }
    
    // Trim recursion
    if (chunk.bounded || chunk.lambda) {
        return;
    }
    
    // Check for end marker
    if (chunk.id === null) {
        // End of stream
        
        // Check for root stream
        if (chunk.parent.parent) {
            // Chunk in deep - kill parent chunk.
            var holder = chunk.parent.parent;
            holder.data.shift();
            this.__poll(holder);
        } else {
            // Root chunk. Emit 'end' and close
            this.emit('end');
            this.closed = true;
            return;
        }
    } else {
        // Data chunk. 
        
        if (Array.isArray(chunk.data) && chunk.data.length > 0) {
            // chunk data is Array - for recursion
            this.__poll(chunk.data[0]);
        } else if (typeof chunk.data === 'string') {
            // chunk is ordinary string
            this.emit('data', chunk.data);
            var holder = chunk.parent;
            holder.data.shift();
            
            // if holder has more chunks - poll first
            if (holder.data.length > 0) {
                this.__poll(holder.data[0]);
            }
        }
    }
};
