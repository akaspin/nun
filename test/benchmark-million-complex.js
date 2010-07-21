var path = require("path");
var nun = require("../");

var name = "complex";

var fixture = require("./fixtures/" + name);
var file = path.normalize(__dirname + "/fixtures/" + name + ".html");

console.log("Million complex benchmark");
console.log(file);

nun.compile(file, fixture.options, function(err, compiled) {
    if (err) {
        throw err;
    }
    
    var buffer = "";
    compiled(fixture.context)
        .on('data', function (c) { buffer += c; })
        .on('end', function () { console.log(buffer); });
    
    var i = 0;
    var d = new Date();
    (function go() {
        if (i++ < 1000000) {
            compiled(fixture.context)
                .on('end', function () {
                    go(); 
                });
        }
    })();
  
    process.addListener('exit', function () {
        console.log("Time taken: " + ((new Date() - d) / 1000) + " secs");
    });
});