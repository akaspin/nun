var sys = require("sys");
var path = require("path");
var events = require('events');

function HStream() {
	events.EventEmitter.call(this);
	this.writes = [];
	this.stream = [];
	this.closed = false;
}
sys.inherits(HStream, events.EventEmitter);
exports.HStream = HStream;

HStream.prototype.map = function (id) {
	if (this.closed) {
		throw new Error("Can't map chunk '" + id + "'. Stream closed.");
	};
	
	var id = path.normalizeArray(id.replace(/^\/|\/$/g, "").split("/"));
	var target = this;
	if (id.length > 1) {
		var target =this.__getChunk(id.slice(0,-1), this.stream);
		if (target == undefined) {
			throw new Error("Can't map chunk '" +	
					id.join("/") + "'. Target stream not found.");
		}
			
		if (target.stream != true ){
			if (target.stream === undefined) target.stream = [];
			if (target.data === undefined) target.data = '';
			
		} else {
			throw new Error("Can't map chunk '" +	
					id.join("/") + "'. It's already completed");
		}
	}
	
	if (!target.stream.some(function(chunk) { 
		if (chunk.id == id[id.length-1] || chunk.id == "__END__")
			return true; 
		})) {
		target.stream.push({
			id:id[id.length-1], 
			data: undefined,
			proc: undefined,
			stream: undefined
		});
	} else {
		throw new Error("Can't map chunk '" +	
				id.join("/") + "'. Stream already closed");
	}
	
};

HStream.prototype.lambda = function(id, lambda) {
	var id = path.normalizeArray(id.replace(/^\/|\/$/g, "").split("/"));
	var target =this.__getChunk(id, this.stream);
	target.proc = lambda;
	this.__process(id);
};

HStream.prototype.write = function(id, data) {
	if (this.closed) {
		throw new Error("Can't write chunk '" + id + "'. Stream closed.");
	};
	
	var id = path.normalizeArray((id).replace(/^\/|\/$/g, "").split("/"));
	var chunk =this.__getChunk(id, this.stream);
	
	if (chunk === undefined) {
		throw new Error("Chunk '" +	id.join("/") + "' not mapped.");
	}
	if (chunk.data !== undefined) {
		throw new Error("Chunk '" +	id.join("/") + "' is not empty.");
	}
	if (chunk.stream instanceof Array) {
		throw new Error("Chunk '" +	id.join("/") + "' has substream.");
	} 

	if (typeof chunk.proc === 'function') { // it's lambda
		var lambda = chunk.proc;
		chunk.proc = undefined;
		var self = this;
		lambda(data, function(data) {
			self.write(id.join("/"), data);
		});
	} else {
		chunk.data = data;
		chunk.stream = true;
		this.__process(id);
	}
};

HStream.prototype.__process = function(id) {
	if (id.length > 1) {
		var parent =this.__getChunk(id.slice(0,-1), this.stream);
		var stream = parent.stream;
		var buffer = parent.data;
		var ended = false;
		while (stream.length) {
			if (stream[0].stream === true) {
				var chunk = stream.shift();
				buffer += chunk.data;
			} else if (stream[0].id === '__END__') {
				stream.shift();
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
			this.__poll();
		}
	} else {
		this.__poll();
	}
};

/**
 * Add mark to indicate what stream can be removed if empty.
 */
HStream.prototype.end = function(id) {
	if (id == '' ) {
		this.map("__END__");
		this.__poll();
	} else {
		var streamId = 
				path.normalizeArray((id).replace(/^\/|\/$/g, "").split("/"));
		var target =this.__getChunk(streamId, this.stream);
		var id = id + "/__END__";
		this.map(id);
		this.__process(path.normalizeArray((id)
				.replace(/^\/|\/$/g, "").split("/")));
	}
};

HStream.prototype.__poll = function() {
	if (this.closed) return;
	var stream = this.stream;
	while (stream.length) {
		var chunk = stream[0];
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
		} else if (this.stream[0].id == '__END__') {
			this.emit('end');
			stream = [];
			this.closed = true;
			break;
		} else {
			break;
		}
	}
};

HStream.prototype.__getChunk = function(id, source) {
	if (source instanceof Array) {
		var huntFor = id[0];
		for ( var i = 0; i < source.length; i++) {
			if (source[i].id == huntFor) {
				if (id.length > 1) {
					return this.__getChunk(id.slice(1), source[i].stream);
				} else {
					return source[i];
				}
			}
		}
	}
};