var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');

var sep = '---------------------';

function Tester(testPattern, paths) {
    this.total = 0;
    this.failed = 0;
    
    this.paths = paths;
    this.pending = this.paths.reduce(function(stream, dir) {
        try {
            return stream.concat(fs.readdirSync(dir).reduce(
                    function(filed, candidate) {
                        var realName = path.normalize(dir + "/" + candidate);
                        var ok = testPattern.exec(candidate) && 
                        fs.statSync(realName).isFile(); 
                        return ok ? filed.concat(realName) : filed;
                    }, []));
        } catch (e) {
            console.warn("WARN: %s", e.message);
            return stream;
        }
    }, []);
}

Tester.prototype.run = function() {
    this.start = Date.now();
    console.log("");
    
    this.next();
};

Tester.prototype.next = function() {
    if (this.pending.length) {
        var file = this.pending.shift();
        var test = {
            file: file,
            name: path.basename(file, ".js"),
            start: Date.now()
        };
        var self = this;
        exec("node " + file, function(error, stdout, stderr) {
            test.end = Date.now();
            test.fail = error;
            test.out = stdout ? "    " + stdout.replace(/\n$/, "").
                    replace(/\n/, "\n    ") : undefined;
            test.err = stderr ? "    " + stderr.replace(/\n$/, "").
                    replace(/\n/g, "\n    ") : undefined;
            
            self.report(test);
            self.next();
        });
    } else {
        this.end();
    }
};

Tester.prototype.report = function(test) {
    if (test.fail !== null) {
        var outer = console.error;
        var mark = "FAIL";
        this.failed++;
    } else {
        var outer = console.log;
        var mark = "PASS";
    }
    
    outer("%s %s in %d sec", mark, test.name, (test.end - test.start) / 1000);
    if (test.out) {outer("+Output:\n%s", test.out);}
    if (test.err) {outer("+Errors:%s%s", test.err);}
    
    this.total++;
};

Tester.prototype.end = function() {
    var end = Date.now();
    console.log("\n%s", sep);
    console.log("TOTAL %d/%d in %ss", this.total - this.failed, 
            this.total, (end - this.start) / 1000);
};

var tester = new Tester(/^test-.+\.js$/, 
        process.argv.length < 3 ? [ __dirname ] : process.argv.slice(2)
                ).run();









