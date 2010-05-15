var sys = require("sys");
var path = require("path");
var nun = require("../");
var fs = require("fs");

var example = process.argv[2];
sys.debug(example);

if (!example) {
  process.exit(0);
}

var f = path.normalize(__dirname + "/fixtures/"+example+".html"); 
var e = path.normalize(__dirname + "/expects/"+example+".html"); 

var fixture = require("./fixtures/" + example);
nun.render(f, fixture.context, fixture.options, 
		function(err, output){
	if (err) throw err;
	
	var buffer = '';
	output.addListener('data', function(data){ buffer += data; })
	.addListener('end', function(){ 
		fs.writeFile(e, buffer, 'utf8', function() {sys.debug(buffer);});
	});
});