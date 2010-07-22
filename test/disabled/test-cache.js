var sys = require("sys");
var assert = require("assert");
var cache = require("../cache");

var renders = 0;
var gets = 0;

for (var i = 0; i < 4; i++) {
    var key = i.toString();
    for (var j = 0; j < 1000; j++) {
        cache.operate(key, 
            function(value) {
                if (value == key) {
                    gets++;
                }
            }, 
            function(callback) {
                setTimeout(function(){
                    renders++;
                    callback(key);
                }, 200);
            });
    }
}

process.addListener("exit", function () {
    assert.equal(renders, 4);
    assert.equal(gets, 4000);
});