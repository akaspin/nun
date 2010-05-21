var sys = require("sys");
var path = require("path");

// openssl support
var have_openssl;
try {
  var crypto = require('crypto');
  have_openssl=true;
} catch (e) {
  have_openssl=false;
}

var parser = require("./parser");
var compiler = require("./compiler");
var cache = require("./cache");

/**
 * Compiles file to template. 
 * @param origin Absolute path to file
 * @param options Options:
 * @param callback
 */
function compile(origin, options, callback) {
	process.nextTick(function () {
		origin = path.normalize(origin);
		
		// determine caching
		var key = "__tpl__" + origin;
		if (options && options.cache == false) key = false;
		
		// If caching enabled -  
		if (key) {
			if (have_openssl) { 
				// if have openssl, add options hash to key
				key += crypto.createHash("sha1").
						update(options).digest("hex");
			}
			cache(key,
					function(fn) { // getter
						callback(undefined, fn);
					},
					function(cb) { // setter
						make(origin, options, function(fn) {
							cb(fn);
						});
					}
			);
		} else {
			// Caching disabled - make and out
			make(origin, options, function(fn) {
				callback(undefined, fn);
			});
		}
	});
}

/**
 * Actually makes all 
 * @param origin
 * @param options
 * @param callback
 */
function make(origin, options, callback){
	parser.parse(origin, options, function(err, stream) {
		compiler.compile(stream, function(fn) {
			callback(fn);
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


