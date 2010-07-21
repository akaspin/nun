var path = require("path");
var nun = require("../");
var fs = require("fs");
var Buffer = require('buffer').Buffer;

var example = process.argv[2];
var nofixture = process.argv[3];

console.log("Example: %s", example);
console.log("No fixture: %s", nofixture);

if (!example) {
  process.exit(0);
}

var f = path.normalize(__dirname + "/fixtures/" + example + ".html"); 
var e = path.normalize(__dirname + "/expects/" + example + ".html"); 

var fixture = {context: {}, options: {}};
if (!nofixture) {
    fixture = require("./fixtures/" + example);
}

nun.render(f, fixture.context, fixture.options, 
        function(err, output){
    if (err) throw err;
    
    var buffer = '';
    output
        .on('data', function(data){ 
            buffer += data; 
        })
        .on('end', function(){
            fs.writeFile(e, buffer, function(err) {
                if (err) throw err;
                console.log(buffer);
            });
        });
});