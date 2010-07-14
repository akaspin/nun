var sys = require("sys");
var path = require("path");
var nun = require("../");
var fs = require("fs");
var Buffer = require('buffer').Buffer;

var example = process.argv[2];
var nofixture = process.argv[3];
sys.debug(example);
sys.debug(nofixture);

if (!example) {
  process.exit(0);
}

var f = path.normalize(__dirname + "/fixtures/"+example+".html"); 
var e = fs.openSync(path.normalize(__dirname + "/expects/"+example+".html"), 'w'); 

var fixture = {context: {}, options: {}};
if (!nofixture) {
    fixture = require("./fixtures/" + example);
}

nun.render(f, fixture.context, fixture.options, 
        function(err, output){
    if (err) throw err;
    
    var buffer = '';
    output
        .addListener('data', function(data){ 
            buffer += data; 
        })
        .addListener('end', function(){ 
            var b = new Buffer(Buffer.byteLength(buffer, 'utf8'));
            b.write(buffer, 'utf8');
            sys.debug(b);
            
            fs.write(e, b, 0, Buffer.byteLength(buffer, 'utf8'), 0);
        });
});