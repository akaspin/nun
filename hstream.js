var sys = require("sys");
var path = require("path");
var events = require('events');

/**
 * Hierarchial Stream. Heart of Nun.
 * @returns {HStream}
 * @constructor
 */
function HStream() {
	events.EventEmitter.call(this);
	this.writes = [];
	this.stream = [];
	this.closed = false;
}
sys.inherits(HStream, events.EventEmitter);
exports.HStream = HStream;

/**
 * Map stream node. 
 * 
 * @param id String identifier in form "[parent/[parent.../]]id"
 */
HStream.prototype.map = function (id) {
	var id = id.split("/");
	
	var target = this;
	if (id.length > 1) {
		var target = this.__getChunk(id.slice(0,-1));
		if (target.stream === undefined) target.stream = [];
		if (target.data === undefined) target.data = '';
	}
	
	target.stream.push({
		id:id[id.length-1], 
		data: undefined,
		proc: undefined,
		stream: undefined
	});
};

/**
 * Set lambda to chunk.
 * 
 * @param id String identifier in form "[parent/[parent.../]]id"
 * @param lambda Function that takes two arguments: data to transform and 
 * 		callback. Callback takes one argument - warped data. 
 */
HStream.prototype.lambda = function(id, lambda) {
	var id = id.split("/");
	var target =this.__getChunk(id);
	target.proc = lambda;
	this.__process(id);
};


HStream.prototype.write = function(id, data) {
	var id = id.split("/");
	this.__write(id, data);
};
HStream.prototype.__write = function(id, data){
	var chunk =this.__getChunk(id);
	
	if (typeof chunk.proc === 'function') { // it's lambda
		var lambda = chunk.proc;
		chunk.proc = undefined;
		var self = this;
		lambda(data, function(data) {
			self.__write(id, data);
		});
	} else {
		chunk.data = data;
		chunk.stream = true;
		this.__process(id);
	}
};

HStream.prototype.__process = function(id) {
	if (id.length == 1) {
		this.__poll();
	} else {
		var parent = this.__getChunk(id.slice(0,-1));
		var stream = parent.stream;
		var buffer = parent.data;
		var ended = false;
		while (stream.length) {
			if (stream[0].stream === true) {
				var chunk = stream.shift();
				buffer += chunk.data;
			} else if (stream[0].id === '_') {
				stream = [];
				ended = true;
			} else {
				break;
			}
		}
		if (!ended) {
			parent.data = buffer;
			this.__poll();
		} else {
			parent.data = undefined;
			parent.stream = undefined;
			this.write(id.slice(0,-1).join("/"), buffer);
			//this.__poll();
		}
	}
};
HStream.prototype.end = function(id) {
	if (id == '' ) {
		this.map("_");
		this.__poll();
	} else {
		var streamId = id.split("/");
		var id = id + "/_";
		this.map(id);
		this.__process(id.split("/"));
	}
};
HStream.prototype.__poll = function() {
	if (this.closed) return;
	var stream = this.stream;
	while (stream.length) {
		if ((stream[0].data != undefined) &&
			(stream[0].proc === undefined )) {
			
			if (stream[0].stream === true) {
				if (stream[0].data.length > 0) {
					this.emit('data', stream[0].data);
				}
				stream.shift();
			} else if (stream[0].stream instanceof Array &&
					stream[0].data !== '') {
				this.emit('data', stream[0].data);
				stream[0].data = '';
				break;
			} else {
				break;
			}
		} else if (this.stream[0].id == '_') {
			this.emit('end');
			stream = [];
			this.closed = true;
			break;
		} else {
			break;
		}
	}
};
/**
 * returns chunk for id
 * @param id Id
 * @returns
 */
HStream.prototype.__getChunk = function(id) {
	var stream = this.stream;
	for (var i=0; i<id.length; i++) {
		for (var j=0; j < stream.length; j++) {
			if (stream[j].id == id[i]) {
				if (i == id.length-1) {
					// found
					return stream[j];
				} else {
					stream = stream[j].stream;
					break;
				}
			}
		}
	}
	return undefined;
};
