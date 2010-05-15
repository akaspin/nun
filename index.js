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

var parser = require("./lib/parser");
var compiler = require("./lib/compiler");

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
				callback(undefined, cache[cached]);
				return;
			}
		}
		parser.parse(origin, options, function(err, stream) {
			compiler.compile(stream, function(fn) {
				
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
