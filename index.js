var sys = require("sys");
var path = require("path");
//var events = require('events');

// openssl support
var have_openssl;
try {
  var crypto = require('crypto');
  have_openssl=true;
} catch (e) {
  have_openssl=false;
}

var parser = require("./lib/parser");
var HStream = require("./lib/hstream").HStream;

var cache = {};

/**
 * Compiles file to template. 
 * @param origin Absolute path to file
 * @param options Options:
 * @param callback
 */
function compile(origin, options, callback) {
	process.nextTick(function () {
		origin = path.normalize(origin);
		var cached = origin;
		if (options && options.cache == false) cached = false;
		
		if (cached) {
			if (have_openssl) {
				cached += crypto.createHash("sha1").
				update(options).digest("hex");
			}
			if (cache[cached]) {
				sys.debug("C");
				callback(undefined, cache[cached]);
				return;
			}
		}
		parser.parse(origin, options, function(err, stream) {
			generate(stream, function(stream) {
				var fn = eval(stream);
				
				if (cached && (!cache[cached])) {
					cache[cached] = fn;
				}
				callback(undefined, fn);
			});
		});
	});
}
exports.compile = compile;

function render(origin, context, options, callback){
	compile(origin, options, function(err, template) {
		callback(err, template(context));
	});
}
exports.render = render;

// private
function generate(stream, callback) {
	var codeStart = 
		'(function(context) {\n' +
			'context = deepClone(context || {});\n' +
			'var HS = new HStream();\n' +
			'var target = context;\n' +
			'var prefix = "";\n' +
			'var i = 0;\n' +
			'process.nextTick(function() { var i = 0; [\n';
	var codeEnd = 
				'].forEach(function(action) {action(); i++; });\n' +
				'HS.end("");\n' +
			'});\n' +
		'return HS; })';
	
	var code = codeStart;

	var resolveTarget = function(name) {
		return (name.charAt(0) === '.' ? 
				"context" + name : "target." + name);
	};
	stream.forEach(function(chunk) {
		if (chunk.op === 'raw') {
			code += 'function() {HS.map(prefix+i); HS.write(prefix+i,"' +
					chunk.value.replace(/\n/g, "\\n") 
					+ '");},\n';
		} else if (chunk.op === 'lookup' || chunk.op === 'unescaped') {
			code += 'function(){HS.map(prefix+i);' + 
				chunk.op +
				'(HS,prefix+i,' +
				resolveTarget(chunk.value) +
				',target);},\n';
		} else if (chunk.op === 'section') {
			code += 'function() {section(HS,prefix+i,' +
			resolveTarget(chunk.value) +
			',target,function(prefix,target){var i = 0;[\n';
		} else if (chunk.op === 'inverted') {
			code += 'function() {inverted(HS,prefix+i,' +
			resolveTarget(chunk.value) +
			',target,function(prefix,target){var i = 0;[\n';
		} else if (chunk.op === 'end') {
			code += "].forEach(function(action) {action(); i++;}); }); },\n";
		}
	});
	
	//sys.debug(code+ codeEnd);
	
	callback(code + codeEnd);
}

/**
 * Section evaluation. Behaviour depends type of target parameter.
 * See readme.
 * 
 * @param hStream HStream instance
 * @param id Root ID
 * @param target Lookup for
 * @param context Global context
 * @param action Bundle of actions
 */
function section(hStream, id, target, context, action) {
	var nofunc = function(hStream, id, target, context, action) {
		if (target instanceof Array && target.length) {
			var i = 0;
			var streamId = id;
			target.forEach(function(item) {
				var id = streamId + "/" + i;
				hStream.map(id);
				var oproto = insertProto(deepClone(item), context);
				action(id, oproto);
				hStream.end(id);
				i++;
			});
			hStream.end(id);
		} else if (
				target !== undefined && 
				target != "" &&
				target != 0 &&
				target == true && 
				target != null &&
				typeof target !== 'object') {
			action(id + "/", context);
			hStream.end(id);
		} else if (typeof target === 'object' && target != null) {
			//sys.debug(sys.inspect(target));
			if (!Object.keys(target).length){
				hStream.write(id, "");
			} else {
				var oproto = insertProto(deepClone(target), context);
				action(id + "/", oproto);
				hStream.end(id);
			}
		} else {
			hStream.write(id, "");
		}
	};
	
	hStream.map(id); // mapping root
	
	if (typeof target === 'function') { // Function
		var target = target(context);
		if (typeof target === 'function') { // Async function
			target(context, function(err, target) {
				if (typeof target === 'function') {// lambda
					hStream.lambda(id, function(data, callback) {
						target(data, context, function(data) {
							callback(typeof data === 'undefined' ? '' 
									: data.toString());
						});
					});
					action(id + "/", context);
					hStream.end(id);

				} else { // No lambda
					nofunc(hStream, id, target, context, action);
				}
			});
		} else { // Sync function
			nofunc(hStream, id, target, context, action);
		}
	} else { // Just context
		nofunc(hStream, id, target, context, action);
	}
}

function inverted(hStream, id, target, context, action) {
	var nofunc = function(hStream, id, target, context, action) {
		if (target == undefined || 
			target == "" ||
			target == false || 
			target == null ||
			target == 0 ||
			(target instanceof Array && !target.length) ||
			(typeof target === 'object' && !Object.keys(target).length)
			) {
			action(id + "/", context);
			hStream.end(id);
		} else {
			hStream.write(id, "");
		}
	};
	
	hStream.map(id); // mapping root
	
	if (typeof target === 'function') { // Function
		var target = target(context);
		if (typeof target === 'function') { // Async function
			target(context, function(err, target) {
				if (typeof target === 'function') {// lambda
					hStream.lambda(id, function(data, callback) {
						target(data, context, function(data) {
							callback(typeof data === 'undefined' ? '' 
									: data.toString());
						});
					});
					action(id + "/", context);
					hStream.end(id);

				} else { // No lambda
					nofunc(hStream, id, target, context, action);
				}
			});
		} else { // Sync function
			nofunc(hStream, id, target, context, action);
		}
	} else { // Just context
		nofunc(hStream, id, target, context, action);
	}
}

function lookup(hStream, id, target, context) {
	var escapeReplace = function (char) {
		switch (char) {
	    	case '<': return '&lt;';
	    	case '>': return '&gt;';
	    	case '&': return '&amp;';
	    	case '"': return '&quot;';
	    	default: return char;
		}
	};
	
	var out = function(string) {
		return typeof string === 'undefined' ? '' : string.toString()
				.replace(/[&<>"]/g, escapeReplace);
	};
	if (typeof target === 'function'){ // Lambda
		var target = target(context);
		var oproto = insertProto(deepClone(target), context);
		if (typeof target === 'function') { // Async
			hStream.lambda(id, function(data, callback) {
				target(oproto, function(err, data) {
					callback(out(data));
			}); });
			hStream.write(id, "");
		} else {
			hStream.write(id, out(target));
		}
	} else {
		hStream.write(id, out(target));
	}
}

function unescaped(hStream, id, target, context) {
	var out = function(string) {
		return typeof string === 'undefined' ? '' : string.toString();
	};
	if (typeof target === 'function'){ // Lambda
		var target = target(context);
		var oproto = insertProto(deepClone(target), context);
		if (typeof target === 'function') { // Async
			hStream.lambda(id, function(data, callback) {
				target(oproto, function(err, data) {
					callback(out(data));
				}); });
			hStream.write(id, "");
		} else {
			hStream.write(id, out(target));
		}
	} else {
		hStream.write(id, out(target));
	}
}

function insertProto(obj, newProto, replaceProto) {
	replaceProto = replaceProto || baseProto;
	var proto = obj.__proto__;
	while (proto !== replaceProto) {
		obj = proto;
		proto = proto.__proto__;
	}
	obj.__proto__ = newProto;
	return obj;
};

var baseProto = ({}).__proto__;
function deepClone(obj) {
	function copy(obj) {
		var newObj = {};
		for (var k in obj) {
			if (obj.hasOwnProperty(k)) { newObj[k] = obj[k]; }
		}
		return newObj;
	}
	
	var newObj = copy(obj);
	var newObjProto = newObj;
	var proto = obj.__proto__;
	while (proto != baseProto) {
		newObjProto.__proto__ = copy(proto);
		newObjProto = newObjProto.__proto__;
		proto = proto.__proto__;
	}
	return newObj;
}
