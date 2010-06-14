var sys = require("sys");
var Script = process.binding('evals').Script;
var HStream = require("./hstream").HStream;

/**
 * Compile parsed template to native JS function.
 * @param stream Parsed template. Represented as Array of 
 * 		{op:string, value: string}
 * @param callback Function that takes compiled function.
 */
function compile(stream, callback) {
	var codeStart = 
		'__fn=function(context) {\n' +
			'context = context || {};\n' +
			'var HS = new HStream();\n' +
			'var target = context;\n' +
			'var prefix = "";\n' +
			'process.nextTick(function() { var __a = [\n';
	var codeEnd = 
				'function() {HS.end("");}];\n' +
				'for(var i=0;i<__a.length;i++){__a[i]()}\n' +
			'});\n' +
		'return HS; }';
	
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
			code += 'function() {section(HS,sectionNormal,prefix+i,' +
			resolveTarget(chunk.value) +
			',target,function(prefix,target){var __a = [\n';
		} else if (chunk.op === 'inverted') {
			code += 'function() {section(HS,sectionInverted,prefix+i,' +
			resolveTarget(chunk.value) +
			',target,function(prefix,target){var __a = [\n';
		} else if (chunk.op === 'end') {
			code += ']; for(var i=0;i<__a.length;i++){__a[i]()} }); },\n';
		}
	});
	
	//sys.debug(code+ codeEnd);
	callback(Script.runInNewContext(code + codeEnd, 
				   {HStream: HStream,
					section: section,
					sectionNormal: sectionNormal,
					sectionInverted: sectionInverted,
					lookup: lookup,
					unescaped: unescaped,
					process: process }
	));
}
exports.compile = compile;

// private
/**
 * Section evaluation. Behaviour depends type of target parameter.
 * 
 * @param hStream HStream instance
 * @param manner Normal or inverted section: sectionNormal or sectionInverted.
 * 		This calls if context is not function or if function is not Lambda. 
 * @param id Root ID
 * @param target Lookup for in context
 * @param context Local context
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

/**
 * Section evaluation with data.
 * 
 * @param hStream HStream instance
 * @param id Root ID
 * @param target Lookup for in context
 * @param context Local context
 * @param action Bundle of actions
 */
function sectionNormal(hStream, id, target, context, action) {
	if (target instanceof Array && target.length) {
		var streamId = id;
		for (var i = 0; i < target.length; i++) {
			var subid = streamId + "/" + i;
			hStream.map(subid);
			action(subid, target[i]);
			hStream.end(subid);
		}
		hStream.end(id);
	} else if (
		target !== undefined && 
		target != "" &&
		target != 0 &&
		target != false && 
		target != null &&
		typeof target !== 'object') {
			action(id + "/", context);
			hStream.end(id);
	} else if (typeof target === 'object' && target != null) {
		if (!Object.keys(target).length){
			hStream.write(id, "");
		} else {
			action(id + "/", target);
			hStream.end(id);
		}
	} else {
		hStream.write(id, "");
	}
};

/**
 * Inverted section evaluation with data.
 * 
 * @param hStream HStream instance
 * @param id Root ID
 * @param target Lookup for in context
 * @param context Local context
 * @param action Bundle of actions
 */
function sectionInverted(hStream, id, target, context, action) {
	if (target == undefined || 
		target == "" ||
		target == false || 
		target == null ||
		target == 0 ||
		(target instanceof Array && !target.length) ||
		(typeof target === 'object' && !Object.keys(target).length)
		) {
		action(id + "/", target);
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
	function escapeReplace (char) {
		switch (char) {
	    	case '<': return '&lt;';
	    	case '>': return '&gt;';
	    	case '&': return '&amp;';
	    	case '"': return '&quot;';
	    	default: return char;
		}
	};
	function out(string) {
		return typeof string === 'undefined' ? '' : string.toString()
				.replace(/[&<>"]/g, escapeReplace);
	};
	if (typeof target === 'function'){ // Lambda
		var target = target(context);
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

