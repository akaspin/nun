var path = require("path");
var nun = require("../");
var fs = require("fs");

var example = process.argv[2];
var opts = process.argv[3];

if (!example) {
    console.error("No example provided");
    process.exit(0);
}
if (!opts) {
    var opts = example;
}


var expect = path.normalize(__dirname + "/expects/" + example + ".html"); 
var fixture = {
    example: path.normalize(__dirname + "/fixtures/" + example + ".html"),
    opts: require("./fixtures/" + opts)
};

console.log("Making fixture:");
console.log(" Example: %s", fixture.example);
console.log(" Options: %s\n", opts);

nun.render(fixture.example, fixture.opts.context, fixture.opts.options, 
        function(err, output){
    if (err) throw err;
    
    var buffer = '';
    output
        .on('data', function(data){ 
            buffer += data; 
        })
        .on('end', function(){
            console.log(buffer);
//            fs.writeFile(expect, buffer, function(err) {
//                if (err) throw err;
//                console.log(buffer);
//            });
        });
});