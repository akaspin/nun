var pit = require("./run");
var cache = require("../cache");

pit.expect("renders", 4);
pit.expect("gets", 4000);

for (var i = 0; i < 4; i++) {
    var key = i.toString();
    for (var j = 0; j < 1000; j++) {
        cache.operate(key, 
            function(value) {
                if (value == key) {
                    pit.mark("gets");
                }
            }, 
            function(callback) {
                setTimeout(function(){
                    pit.mark("renders");
                    callback(key);
                }, 200);
            });
    }
}

