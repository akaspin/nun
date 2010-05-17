var sys = require("sys");
var HStream = require("./hstream").HStream;

var baseProto = ({}).__proto__;

/**
 * Compile parsed template to native JS function.
 * @param stream Parsed template. Represented as Array of 
 * 		{op:string, value: string}
 * @param callback Function that takes compiled function.
 */
function compile(stream, callback) {
	var codeStart = 
		'(function(context) {\n' +
//			'context = deepClone(context || {});\n' +
			'context = context || {};\n' +
			'var HS = new HStream();\n' +
			'var target = context;\n' +
			'var prefix = "";\n' +
			'process.nextTick(function() { var __a = [\n';
	var codeEnd = 
				'function() {HS.end("");}];\n' +
				'for(var i=0;i<__a.length;i++){__a[i]()}\n' +
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
			code += 'function() {section(HS,static_section,prefix+i,' +
			resolveTarget(chunk.value) +
			',target,function(prefix,target){var __a = [\n';
		} else if (chunk.op === 'inverted') {
			code += 'function() {section(HS,static_inverted,prefix+i,' +
			resolveTarget(chunk.value) +
			',target,function(prefix,target){var __a = [\n';
		} else if (chunk.op === 'end') {
			code += ']; for(var i=0;i<__a.length;i++){__a[i]()} }); },\n';
		}
	});
	
	//sys.debug(code+ codeEnd);
	var fn = eval(code + codeEnd);
	
	callback(fn);
}
exports.compile = compile;

// private
/**
 * Section evaluation. Behaviour depends type of target parameter.
 * 
 * @param hStream HStream instance
 * @param id Root ID
 * @param target Lookup for
 * @param context Context
 * @param action Bundle of actions
 */
function section(hStream, manner, id, target, context, action) {
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
					manner(hStream, id, target, context, action);
				}
			});
		} else { // Sync function
			manner(hStream, id, target, context, action);
		}
	} else { // Just context
		manner(hStream, id, target, context, action);
	}
}

function static_section(hStream, id, target, context, action) {
	if (target instanceof Array && target.length) {
		var streamId = id;
		for (var i = 0; i < target.length; i++) {
			var subid = streamId + "/" + i;
			hStream.map(subid);
			//var oproto = insertProto(deepClone(target[i]), context);
			action(subid, target[i]);
			hStream.end(subid);
		}
		hStream.end(id);
		return;
	}
	
	if (target !== undefined && 
		target != "" &&
		target != 0 &&
		target == true && 
		target != null &&
		typeof target !== 'object') {
			action(id + "/", context);
			hStream.end(id);
			return;
	}
	
	if (typeof target === 'object' && target != null) {
		if (!Object.keys(target).length){
			hStream.write(id, "");
		} else {
			//var oproto = insertProto(deepClone(target), context);
			action(id + "/", context);
			hStream.end(id);
		}
	} else {
		hStream.write(id, "");
	}
};

function static_inverted(hStream, id, target, context, action) {
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

/**
 * Lookup for variable.
 * 
 * @param hStream HStream instance
 * @param id Root ID
 * @param target Lookup for
 * @param context Context
 */
function lookup(hStream, id, target, context) {
	function out(string) {
		return typeof string === 'undefined' ? '' : string.toString()
				.replace(/[&<>"]/g, escapeReplace);
	};
	if (typeof target === 'function'){ // Lambda
		var target = target(context);
		//var oproto = insertProto(deepClone(target), context);
		if (typeof target === 'function') { // Async
			hStream.lambda(id, function(data, callback) {
				target(context, function(err, data) {
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

function escapeReplace (char) {
	switch (char) {
    	case '<': return '&lt;';
    	case '>': return '&gt;';
    	case '&': return '&amp;';
    	case '"': return '&quot;';
    	default: return char;
	}
};

/**
 * Some as lookup. But not escape HTML characters.
 * 
 * @param hStream HStream instance
 * @param id Root ID
 * @param target Lookup for
 * @param context Context
 */
function unescaped(hStream, id, target, context) {
	function out (string) {
		return typeof string === 'undefined' ? '' : string.toString();
	};
	if (typeof target === 'function'){ // Lambda
		var target = target(context);
		//var oproto = insertProto(deepClone(target), context);
		if (typeof target === 'function') { // Async
			hStream.lambda(id, function(data, callback) {
				target(context, function(err, data) {
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


function deepClone(obj) {
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

function copy(obj) {
	var newObj = {};
	for (var k in obj) {
		if (obj.hasOwnProperty(k)) { newObj[k] = obj[k]; }
	}
	return newObj;
}
