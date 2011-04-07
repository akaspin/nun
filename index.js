var path = require("path");
var crypto = require('crypto');

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
                // if have openssl, add options hash to key
                key += crypto.createHash("sha1").
                        update(JSON.stringify(options)).digest("hex");
            cache.operate(key,
                function(fn) { // getter
                    callback(undefined, fn);
                },
                function(cb) { // setter
                    make(origin, options, function(err, fn) {
                        if (err) {
                            callback(err);
                            return;
                        }
                        cb(fn);
                    });
                }
            );
        } else {
            // Caching disabled - make and out
            make(origin, options, function(err, fn) {
                if (err) {
                    callback(err);
                    return;
                }
                callback(undefined, fn);
            });
        }
    });
}
exports.compile = compile;

function render(origin, context, options, callback){
    compile(origin, options, function(err, template) {
        if (err) {
            callback(err);
            return;
        }
        
        callback(undefined, template(context));
    });
}
exports.render = render;

/**
 * Add compile-phase filter. Will flush all cache.
 * @param name Filter name
 * @param filter Filter
 */
function setFilter(name, filter) {
    cache.flush();
    parser.defaultFilters[name] = filter;
}
exports.setFilter = setFilter;

/**
 * Actually makes all 
 * @param origin
 * @param options
 * @param callback
 */
function make(origin, options, callback){
    parser.parse(origin, options, function(err, stream) {
        if (err) {
            callback(err);
            return;
        }
        
        compiler.compile(stream, function(fn) {
            callback(undefined, fn);
        });
    });
}

