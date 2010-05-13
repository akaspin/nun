var sys = require("sys");
var fs = require("fs");
var path = require("path");
var Buffer = require('buffer').Buffer;

var defaultFilters = {
	escape: function(data, callback) {
			var escapeReplace = function (char) {
				switch (char) {
			    	case '<': return '&lt;';
			    	case '>': return '&gt;';
			    	case '&': return '&amp;';
			    	case '"': return '&quot;';
			    	default: return char;
				}
			};
			var data = data.replace(/[&<>"]/g, escapeReplace);
			callback(undefined, data);
	},
	compress: function(data, callback) {
        callback(undefined, data
        		.replace(/  */g, ' ')
				.replace(/\n /g, '\n')
				.replace(/\n\n*/g, '\n')
        		);
    }
};

/**
 * Parses template file to tokenized stream.
 * 
 * @param origin Absolute path to file
 * @param filters Custom compile-phase filters
 * @param callback Function that takes two arguments: 
 * 				   Error and tokenized stream. 
 */
function parse(origin, customOptions, callback) {
	loader(origin, function(err, source) {
	parseText(source, origin, customOptions, function(err, stream) {
			callback(err, stream);
			
	});	});
}
exports.parse = parse;

/**
 * Parses template text to tokenized stream.
 * 
 * @param source Template code
 * @param origin Absolute path to root directory
 * @param filters Custom compile-phase filters
 * @param callback Function that takes two arguments: 
 * 				   Error and tokenized stream.
 */
function parseText(source, origin, customOptions, callback) {
	var origin = (origin || __dirname + "/" + "fake.template");
	
	// parse options
	var options = {	filters: {}, compress: false };
	for (var i in defaultFilters) options.filters[i] = defaultFilters[i];
	
	if (customOptions) {
		options.compress = customOptions.compress != false ? true : false;
		
		if (customOptions.filters) {
			for (var i in customOptions.filters) 
				options.filters[i] = customOptions.filters[i];
		}
	}
	
	tokenize(source, options, function(err, stream) {
	applyOverrides(err, stream, {}, origin, options, function(err, stream) {
	expandPartials(err, stream, origin, options, function(err, stream) {
	applyFilters(err, stream, options, function(err, stream) {
					callback(err, stream);
	}); }); }); });
}
exports.parseText = parseText;

// private
/**
 * Apply {{+...}} meta blocks if override operator {{<...}} exists.
 * Else just destroys meta blocks. Override operator must be first in
 * override template.
 */
function applyOverrides(err, stream, metas, origin, options, callback) {
	if (err) {
		callback(err);
		return;
	}
	
//	process.nextTick(function () {
		// determine override state
		var over = false;
		stream.forEach(function(chunk) {
			if (chunk.op == 'override') over = chunk.value;
		});
		if (over) { // it's override
			// collect metas and call base template
			var huntFor = "";
			var ingest = false;
			stream.forEach(function(chunk) {
				if (chunk.op == 'meta') {
					huntFor = chunk.value;
					if (!metas[huntFor]) {
						metas[huntFor] = [];
						ingest = true;
					} else {
						ingest = false;
					}
				} else if (chunk.op == 'end' && chunk.value == huntFor) {
					huntFor = "";
				} else if (huntFor) {
					if (ingest) metas[huntFor].push(chunk);
				}
			});
			
			bOrigin = makePath(origin, over);
			loader(origin, function(err, source) {
			tokenize(source, options, function(err, stream) {
			applyOverrides(err, stream, metas, bOrigin, options, 
					function(err, stream) {	
						callback(err, stream);
			});	}); });
		} else if (Object.keys(metas).join("") != "") { 
			// base template and metas, apply metas and out
			var out = [];
			var huntFor = "";
			stream.forEach(function(chunk) {
				if (chunk.op == "meta" && (chunk.value in metas)) {
					huntFor = chunk.value;
				} else if (chunk.op == "end" && chunk.value == huntFor) {
					Array.prototype.push.apply(out, metas[huntFor]);
					huntFor = "";
				} else if (!huntFor) {
					out.push(chunk);
				}
			});
			callback(err, out);
		} else { // Base template, no metas - just clean metas
			cleanup(err, stream, 'meta', function(err, stream) {
					callback(err, stream);
			});
		}
//	});
}

/**
 * Load and expand partials
 * @param err
 * @param stream
 * @param origin
 * @param callback
 */
function expandPartials(err, stream, origin, options, callback) {
	if (err) {
		callback(err);
		return;
	}
	
//	process.nextTick(function () {
		var partials = stream.map(function(chunk) {
			return chunk.op == 'partial' ?	chunk.value	: false;
		}).filter(filterFalsy);
		
		if (partials.length) {
			var actions = partials.map(function(candidate) {
				var absPath = makePath(origin, candidate);
				return function(callback) {
					parse(absPath, options, function(err, stream) {
						callback(err, stream, candidate);
					});
				};
			});
			parallel(actions, function(results) {
				var partials = {};
				results.forEach(function (result) {
					if (result.type === 'success') {
						partials[result.values[1]] = result.values[0];
					}
				});
				var out = [];
				stream.forEach(function(chunk) {
					if (chunk.op == 'partial' && chunk.value in partials) {
						Array.prototype.push.apply(out, 
								partials[chunk.value]);
					} else {
						out.push(chunk);
					}
				});
				callback(err, out);
			});
		} else {
			callback(err, stream);
		}
//	});
}

/**
 * Recursively apply filters to raw chunks.
 * @param err
 * @param stream
 * @param options
 * @param callback
 */
function applyFilters(err, stream, options, callback) {
	/**
	 * Join raw chunks.
	 * @param err
	 * @param stream
	 * @param callback
	 */
	function compress(err, stream, callback) {
		if (err) {
			callback(err);
			return;
		}
//		process.nextTick(function () {
			var out = [];
			
			stream.forEach(function(chunk) {
				if (chunk.op == 'raw' && out.length && 
						out[out.length-1].op == 'raw') {
					out[out.length-1].value = 
						(out[out.length-1].value + chunk.value);
				} else {
					out.push(chunk);
				}
			});
			callback(undefined, out);
//		});
	}
	
	if (err) {
		callback(err);
		return;
	}
	
//	process.nextTick(function () {
		compress(err, stream, function(err, stream) {
			// collect filters without nested filters
			collected = [];
			nested = false;
			buffer = [];
			huntFor = "";
			huntId = undefined;
			for ( var i = 0; i < stream.length; i++) {
				if (stream[i].op == 'filter') {
					if (huntFor) nested = true;
					huntFor = stream[i].value;
					huntId = i;
					buffer = [];
				} else if (stream[i].op == "end" 
						&& stream[i].value == huntFor) {
					Array.prototype.push.apply(collected, buffer);
				} else if (huntFor && stream[i].op == "raw") {
						buffer.push({id:i, 
							value: stream[i].value, 
							filter: huntFor,
							fId: huntId});
				}
			}
			
			if (collected.length) {
				var actions = collected.map(function(sign) {
					return function(callback) {
						options.filters[sign.filter](
								sign.value,	function(err, value) {
							callback(err, value, sign.id, sign.fId);
						});
					};
				});
				parallel(actions, function(results) {
					var toKill = []; // filter chunks
					results.forEach(function(result) {
						if (result.type === 'success') {
							var value = result.values[0];
							var id = result.values[1];
							var fId = result.values[2];
							stream[id].value = value;
							stream[fId].op = "TO_KILL";
						}
					});
					cleanup(err, stream, "TO_KILL", function(err, stream) {
						nested ? applyFilters(err, stream, options, callback) 
								: callback(undefined, stream);
					});
				});
			} else { // no filters - just do callback
				callback(undefined, stream);
			}
		});
//	});
}



function cleanup(err, stream, op, callback){
	if (err) {
		callback(err);
		return;
	}
	
//	process.nextTick(function () {
		var huntFor = "";
		var out = stream.filter(function(chunk) {
			if (chunk.op == op) {
				huntFor = chunk.value;
				return false;
			} else if (chunk.op == "end" && chunk.value == huntFor) {
				huntFor = "";
				return false;
			} else {
				return true;
			}
		});
		callback(undefined, out);
//	});
}

/**
 * Make flat massive of operators from source file in following form:
 * 
 *     [ { op:opType, value:value}, ... ]
 * 
 * @param {String} source - Source text
 * @param {function(parsed)} callback - Callback
 */
function tokenize(source, options, callback) {
	var escapeRegex = function(text) {
		if (!arguments.callee.sRE) {
			var specials = [ '/', '.', '*', '+', '?', '|', '(', ')', 
			                 '[', ']', '{',	'}', '\\' ];
			arguments.callee.sRE = new RegExp('(\\' + 
					specials.join('|\\') + ')', 'g');
		}
		return text.replace(arguments.callee.sRE, '\\$1');
	};
	
	var tokenRe;
	var opRe;
	var opsSig = {
			'&' : 'unescaped',
			'#' : 'section',
			'^' : 'inverted',
			'/' : 'end',
			'<' : 'override',
			'>' : 'partial',
			'+' : 'meta',
			'~' : 'filter'
	};
	var setRe = function (oTag, cTag) {
		tokenRe = new RegExp(
				"(" + escapeRegex(oTag) + ".+?" + escapeRegex(cTag)	+ ")");
		opRe = new RegExp(escapeRegex(oTag) + " *(.) *(.*) *" +
				escapeRegex(cTag) );
	};
	setRe("{{", "}}");
	
	var lines = source.split(/\n/g);
	var output = lines.reduce(function(buffer, line) {
		var tokens = line.split(tokenRe);
		// chop whitespace for single line tokens
		if (
			tokens.length == 3
			&& tokens[0].search(/^ *$/) != -1
			&& tokens[2] == ""
			&& (tokens[1].match(opRe))[1].search(/[<>+!~#^\/=]/) != -1
			) {
			tokens = [tokens[1]];
		}
		while (tokens.length) {
			var op = tokens[0].match(opRe);
			
			if (!op) { // Raw value
				buffer.push({
					op: 'raw',
					value: tokens[0] + (tokens.length==1 ? "\n" : "")
				});
				tokens.shift();
			} else if (op[1] == "!") { // comment
				tokens.shift();
			} else if (op[1] == "=") { // shapeshift
				var shaped = op[2].split(" ");
				setRe(shaped[0], shaped[1]);
				tokens.shift();
				if (tokens.length) {
					tokens = tokens.join("").split(tokenRe);
				}
			} else if (op[1] in opsSig) { // some op
				buffer.push({op:opsSig[op[1]], value: op[2]});
				tokens.shift();
			} else { // lookup
				buffer.push({op:"lookup", value: op[1] + op[2]});
				tokens.shift();
			}
		};
		return buffer;
	}, []);

	//sys.debug(sys.inspect(output));
	
	callback(undefined, output);
};

/**
 * Loads file. Fixes issue http://github.com/ry/node/issues#issue/112
 * 
 * @param path Absolute path to file
 * @param callback Callback function that takes two arguments: Error 
 * 		and loaded string. 
 */
function loader(file, callback) {
	fs.readFile(file, 'binary', function(err, contents) {
		if (err) {
			callback(err);
		} else {
			var buf = new Buffer(contents.length);
			buf.write(contents, 'binary', 0);
			var output = buf.toString("utf8")
					.replace(/\\+/g, '\\\\')
					.replace(/\r/g, "")
					.replace(/\t/g, '    ')
					.replace(/"/g, "\\\"")
					.replace(/ +\n/g, '\n');
			
			callback(undefined, output);
		}
	});
};

function parallel(callbacks, callback) {
	var results = [];
	var acc = function(err) {
		var result = Array.prototype.slice.call(arguments, 1);
		results.push( {
			type : err ? 'error' : 'success',
					values : err || result
		});
		if (results.length === callbacks.length) {
			callback(results);
		}
	};
	callbacks.forEach(function(cb) {
		cb(acc);
	});
}

/**
 * Used with Array.filter to remove falsy items.
 * @param item 
 */
function filterFalsy(item) {
  return item;
}

function makePath(origin, name) {
	return path.normalize(path.dirname(origin) + "/" + name);
}
