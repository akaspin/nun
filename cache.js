/**
 * Asynchronous concurrent cache for node.js. Created for eliminate 
 * "dog-pile effect".
 */

var cache = {};
var waiters = {};
var needFlush = [];

/**
 * Try to get value from cache for key.
 * 
 * @example
 * 
 *         var cache = require("./cache");
 * 
 *         for (var i = 0; i < 100; i++) {
 *             cache("key", 
 *                 function(value){ // Getter
 *                     console.log("Getted: " + value);
 *                 },
 *                 function(callback){
 *                     setTimeout(function(){
 *                         console.log("Do render");
 *                         callback("test");
 *                     }, 2000);
 *                 }
 *             );
 *         }
 * 
 * @param key Key in cache
 * @param getter Function that fires if value for key is found. 
 *         Takes one argument - value from cache.
 * @param setter Function that fires if value for key is not found.
 *         Takes one argument - callback. Callback takes one argument too -
 *         generated value.
 */
function operate(key, getter, setter) {
    if (key in cache) {
        getter(cache[key]);
    } else if (key in waiters) { // no cache look for waiters
        waiters[key].push(getter);
    } else { // no cache, no waiters - executing setter
        waiters[key] = [];
        waiters[key].push(getter);
        setter(function(value) {
            put(key, value);
        });
    }
}
exports.operate = operate;

/**
 * Flush all cache keys with prefix. This operation will be executed
 * after all waiters with this prefix is served. 
 * @param prefix Prefix of keys. If not defined - all cache will flushed.
 */
function flush(prefix) {
    prefix = (prefix || "");
    
    Object.keys(waiters).forEach(function(waiter) {
        if (waiter.indexOf(prefix) == 0) {
            needFlush.push(waiter);
        }
    });
    // delete all not locked keys in cache
    for (var key in cache) {
        if (key.indexOf(prefix) == 0 && needFlush.indexOf(key) == -1) {
            delete cache[key];
        }
    }
}
exports.flush = flush;

// private
function put(key, value) {
    cache[key] = value;
    waiters[key].forEach(function(action) {
        action(value);
    });
    delete waiters[key];
    var kill = needFlush.indexOf(key);
    if (kill != -1) {
        delete cache[key];
        needFlush.splice(kill, 1);
    }
}
