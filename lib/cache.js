/**
 * Asynchronous concurrent cache for node.js. Created for eliminate 
 * "dog-pile effect".
 */

cache = {};
locks = {};

/**
 * Try to get value from cache for key.
 * 
 * @example
 * 
 * 		var sys = require("sys");
 * 		var cache = require("./cache");
 * 
 * 		for (var i = 0; i < 100; i++) {
 * 			cache.get("key", 
 * 				function(value){ // Getter
 * 					sys.debug("Getted: " + value);
 * 				},
 * 				function(callback){
 * 					setTimeout(function(){
 * 						sys.debug("Do render");
 * 						callback("test");
 * 					}, 2000);
 * 				}
 * 			);
 * 		}
 * 
 * @param key Key in cache
 * @param getter Function that fires if value for key is found. 
 * 		Takes one argument - value from cache.
 * @param setter Function that fires if value for key is not found.
 * 		Takes one argument - callback. Callback takes one argument too -
 * 		generated value.
 */
function get(key, getter, setter) {
	if (key in cache) {
		getter(cache[key]);
	} else if (key in locks) { // no cache look for locks
		locks[key].push(getter);
	} else { // no cache, no locks - executing setter
		locks[key] = [];
		locks[key].push(getter);
		setter(function(value) {
			put(key, value);
		});
	}
}
module.exports = get;

// private
function put(key, value) {
	locks[key].forEach(function(action) {
		action(value);
	});
	delete locks[key];
}
