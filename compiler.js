var Script = process.binding('evals').Script;
var HStream = require("./hstream").HStream;

// Execution context
var bundle = {
    HStream : HStream,
    raw : raw,
    section : section,
    section_section : sectionMannerNormal,
    section_inverted : sectionMannerInverted,
    lookup : lookup,
    lookup_lookup : lookupMannerNormal,
    lookup_unescaped : lookupMannerUnescaped,
    process : process
};

// Code blocks
var codeStart = 
    "__fn=function(context) {\n" +
		"context = context || {};\n" +
		"var hStream = new HStream();\n" +
		"var target = context;\n" +
		"var chunk = hStream.root;\n" +
		"process.nextTick(function() {" +
		    "[\n"; 
var codeEnd = 
            "function() { chunk.end(); }]\n" +
            "   .forEach(function(__a){ __a(); });\n" +
        "});\n" + // nexTick end
    "return hStream; }\n"; //

/**
 * 
 * @param stream
 * @param callback
 */
function compile(stream, callback) {
    function resolveTarget(name) {
        return (name.charAt(0) === '.' ? 
                "context" + name : "target." + name);
    }
    
    var code = codeStart;
    
    // Walk through stream 
    stream.forEach(function(chunk) {
        if (chunk.op === 'raw') {
            // Just raw chunk
            code += 'function() { raw(chunk.map(), "' +
                chunk.value.replace(/\n/g, "\\n") 
                + '"); },\n';
        } else if (chunk.op === 'lookup' || chunk.op === 'unescaped') {
            // Lookup or unescaped chunk
            code += 'function() { lookup(lookup_' + chunk.op +
                ', chunk.map(), ' + resolveTarget(chunk.value) +
                ', target); },\n';
        } else if (chunk.op === 'section' || chunk.op === 'inverted') {
            // Section
            code += '   function() { section(section_' + chunk.op +
            ', chunk.map(), ' +
            resolveTarget(chunk.value) +
            ', target, function(chunk, target) { [\n';
        } else if (chunk.op === 'end') {
            code += '   ].forEach(function(__a){__a();})})},\n';
        }
    });
    
//    console.log(code + codeEnd);
    
    // Call callback
    callback(Script.runInNewContext(code + codeEnd, bundle));
}
exports.compile = compile;

/**
 * Just write raw chunk
 * @param {Chunk} chunk Target chunk in hStream
 * @param {String} data
 */
function raw(chunk, data){
    chunk.write(data);
}

/**
 * Section evaluation
 * @param manner Section evaluation manner: Normal or Inverted
 * @param {Chunk} chunk Target chunk in hStream
 * @param target Variable
 * @param context Up-one context
 * @param {Array} action Bundle of actions
 */
function section(manner, chunk, target, context, action) {
    if (typeof target === 'function') {
        // Target is function
        var target = target(context);
        
        // Check for async
        if (typeof target === 'function') {
            // It's async function. Let's do it
            target(context, function(err, target) {
                // Check - is we have lambda
                if (typeof target === 'function') {
                    // Ohh. It's lambda
                    chunk.lambda = function(data, callback) {
                        target(data, context, function(data) {
                            callback(typeof data === 'undefined' ? '' 
                                    : data.toString());
                        });
                    };
                    
                    action(chunk, context);
                    chunk.end();
                } else {
                    // No lambda - just async function
                    manner(chunk, target, context, action);
                }
            });
        } else {
            // Sync function - run it
            manner(chunk, target, context, action);
        }
    } else {
        // Just context
        manner(chunk, target, context, action);
    }
}

/**
 * Normal section evaluation manner with data. See readme for details.
 * @param {Chunk} chunk Target chunk in hStream
 * @param target Local context
 * @param context Up-one context
 * @param {Array} action Bundle of actions
 */
function sectionMannerNormal(chunk, target, context, action) {
    if (Array.isArray(target)) {
        // target is array
        if (!!target.length) {
            // Non-empty - evaluate
            for (var i = 0; i < target.length; i++) {
                var act = chunk.map();
                action(act, target[i]);
                act.end();
            }
            chunk.end();
        } else {
            // Empty - break
            chunk.write("");
        }
    } else if (typeof target === 'object' && target !== null) {
        // Target is Object
        if (!!Object.keys(target).length) {
            // Non-empty - evaluate
            action(chunk, target);
            chunk.end();
        } else {
            // Empty - break
            chunk.write("");
        }
    } else if (!!target) {
        // Just value
        action(chunk, context);
        chunk.end();
    } else {
        // Not acceptable - break
        chunk.write("");
    }
}

/**
 * Inverted section evaluation manner with data. See readme for details.
 * @param {Chunk} chunk Target chunk in hStream
 * @param target Local context
 * @param context Up-one context
 * @param {Array} action Bundle of actions
 */
function sectionMannerInverted(chunk, target, context, action) {
    if ((target instanceof Array && !target.length) ||
        (typeof target === 'object' && target !== null && 
                !Object.keys(target).length) || 
         !target) {
        // Inverted
        action(chunk, target);
        chunk.end();
    } else {
        // Normal - skip
        chunk.write("");
    }
}

/**
 * Lookup for variable
 * @param manner Lookup manner: normal or unescaped
 * @param {Chunk} chunk Target chunk in hStream
 * @param target Variable
 * @param context Up-one context
 */
function lookup (manner, chunk, target, context) {
    if (typeof target === 'function'){ 
        // Target is function
        var target = target(context);
        if (typeof target === 'function') { 
            // It's lambda
            chunk.lambda = function(data, callback) {
                target(context, function(err, data) {
                    callback(manner(data));
            }); };
            chunk.write("");
        } else {
            // Not async - just run it
            chunk.write(manner(target));
        }
    } else {
        // target is just variable
        chunk.write(manner(target));
    }
}

/**
 * Normal lookup manner - escaped
 * @param {String} string String
 * @returns {String} Escaped string
 */
function lookupMannerNormal(string) {
    function escapeReplace (char) {
        switch (char) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '"': return '&quot;';
            default: return char;
        }
    };
    return typeof string === 'undefined' ? '' : string.toString()
            .replace(/[&<>"]/g, escapeReplace);
}

/**
 * Unescaped lookup manner
 * @param {String} string String
 * @returns {String} Unscaped string
 */
function lookupMannerUnescaped(string) {
    return typeof string === 'undefined' ? '' : string.toString();
}

