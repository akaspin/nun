# Nun

Nun is totally asynchronous non-blocking template engine for 
[node.js](http://nodejs.org).

## About

Nun inspired Mustache, ctemplate, Django Templating system and Mu. I need some
extra features like metatemplating, raw filters, lambdas etc. So. Here is 
another bicycle.

Nun writed specially for *node.js*. Nun compiles templates to native cached 
javascript functions. Compiled functions acts as node.js EventEmmiters. 

## Features

* Clear and flexible syntax.
* Totally async non-blocking behaviour. Results sends to client as soon as
  possible. All independent of each other asynchronous function are executed 
  in parallel as early as possible.
* Compile time preprocessing: overrides, partials and filters.

## Usage

Basic usage is very simple:

    var sys = require("sys");
    var nun = require("nun");
    
    var origin = __dirname + "/template.html";
    
    nun.render(origin, { name: "John Dow" }, {}, function(err, output){
        if (err) throw err;
        
        var buffer = '';
        output.addListener('data', function(data){ buffer += data; })
              .addListener('end', function(){ sys.puts(buffer) });
    });
    
template.html

    Name is {{name}}.
    
Output:
    
    Name is John Dow.
    
`render` function takes four arguments: 

* `origin` - absolute path to template. 
* `context` - Object, that contains set of variables or functions.
* `options` - Compile-phase options.
* `callback` - Callback function 

Callback function takes two arguments: compile-phase error (if all OK 
it sets to `undefined`) and running template event emitter. With template event 
emitter you can add listeners for two events in node.js usual way: `data` and 
`end`. `data` event fires on next template part is rendered. `end` event 
fires on template completelly rendered.

Instead of rendering the template can be compiled for future use.

    var sys = require("sys");
    var nun = require("nun");
    
    var origin = __dirname + "/template.html";
    
    nun.compile(origin, {}, function(err, template){
        if (err) throw err;
        
        var buffer = '';
        template(ctx)
            .addListener('data', function(data){ buffer += data; })
            .addListener('end', function(){ sys.puts(buffer) });
    });
    
To run the tests:

    cd where/is/nun
    make    

## Basic syntax

Basic syntax in Nun is very similar to Mustache with some slight differences.

All tags in Nun enclosed in pair delimiters. By default `{{` and `}}`. After the 
opening delimiter may be followed by the operator. After that, always follows
context key. Tags in Nun may contain spaces between parts of tags.

For example:

    {{name}} 
    {{deep.in.name}} 
    {{#section_start}} 

Nun supports following operators:

* Lookup. Escaped and unescaped
* Sections and lambdas
* Tag shapeshifting
* Template overrides
* Template partials
* Compile-phase filters
    
## Lookups

Lookups is a basic type of Nun tags. With lookup tag Nun try to find key in 
context. Tag renders if key exists, and not undefined. If reference not found 
or value is undefined, nothing will be rendered. 

All output are HTML escaped by default. If you want to render unescaped HTML,
use ampersand `&` as operator. Unescaped triple tags from mustache 
`{{{ }}}` not supported.

Template:

    {{name}} born in {{year}}. {{age}}
    Escaped: {{tag}}
    Unescaped: {{&tag}}
    
Context:

    {
        name: "John Dow",
        year: 1992,
        tag: "<tag>"
    }
    
Output:

    John Dow born in 1992.
    Escaped: &lt;tag&gt
    Unescaped: <tag>
    
Key may be a synchronous or asynchronous function.

In synchronous way `year` key from previous template may looks like this:

    year: function(context){
        return 1992;
    }
    
Function just receives context in args and returns output. Depending on the 
operation returned result may be escaped or not. 

In async way function may look little wildly:

    year: function() {
        return function(context, callback) { 
            setTimeout(function() { // Expensive operation
                callback(undefined, 1992);
            }, 1000);
        };
    },

So lets start digging. Function returns function what receives two argumens:
context and callback. Callback receives two arguments: error and data. 
    
## Sections

Sections render blocks of text one or more times, depending on the value of the 
key in the current context. A section begins with a pound `#` and ends with a 
slash `/`. Local context is defined by key. In sections with local context you 
can access to global context by placing dot `.` before tag id.

The behavior of the section is determined by the value of the key in context. 
Value in context can be one of following:

* Non empty array
* Non empty object
* Non empty String 
* Non Zero Number
* Boolean true

If the value does not fit into these limits, nothing will be rendered.

### Array sections

If value is Array of objects, contents of section will be evaluated one or more 
times with local context. Local context is one Object in Array for each
iteration.

Template:
    
    {{#info}}
        {{name}} was born in {{year}}. Now {{.year}}
    {{/info}}
        
Context:
    
    { 
        info: [
            {name: 'Alex', year: 1992},
            {name: 'Spot', year: 1994},
            {name: 'Ab', year: 1942}
        ],
        year: 2010
    }
        
Will produce output:
        
    Alex was born in 1992. Now 2010
    Spot was born in 1994. Now 2010
    Ab was born in 1942. Now 2010
        
### Object sections

If value is Object what contains any keys, section renders once with local 
context.

For example: if you render template from Arrays 
sections with following context:

    { 
        info: {
            name: 'Alex', 
            year: 1992
        },
        year: 2010
    }

Will produce this:

    Alex was born in 1992. Now 2010
    
### Single value sections

If value is non empty String, positive or negative not null Number or Boolean 
true, section renders once with. Local context will be set to one step up in
hierarchy.

### Inverted sections

While sections can be used to render text one or more times based on the 
value of the key, inverted sections may render text once based on the inverse 
value of the key. That is, they will be rendered if the key doesn't exist, 
is false, is Zero Number, is Empty String, is an empty Array or empty Object.

An inverted section begins with a caret (hat) `^` and ends with a slash `/`.

Template:

    {{#info}}
        {{name}} was born in {{year}}
    {{#info}}
    {{^info}}
        Nothing here.
    {{/info}}
    
Context:

    {
        info: []
    }
    
Output:
    
    Nothing here.
    
### Functions as keys 

Instead of constants in the context, the key value of section can be generated 
by function. The subsequent behavior depends on the type of values and described 
previously. Functions can be synchronous or asynchronous and syntax is same as
in lookups.

For example: if you replace context for template from Arrays sections with this:

    { 
        info: function(){
            return function(context, callback) {
                setTimeout(function(){
                    callback(undefined, [
                        {name: 'Alex', year: 1992},
                        {name: 'Spot', year: 1994},
                        {name: 'Ab', year: 1942}
                    ]);
                }, 1000);
            }
        }
        year: function(context) {
            return 2010;
        }
    }
     
Will produce same output:
        
    Alex was born in 1992. Now 2010
    Spot was born in 1994. Now 2010
    Ab was born in 1942. Now 2010
    

## Lambdas

Lambdas is like sections. But with different behaviour. Instead of sections
lambdas used for warp their contents. All contents evaluates before lambdas 
with global context. Lambdas always executed asynchronously. 

Template:
    
    {{#lambda}}
        Lambda contents {{name}}.
    {{/lambda}}
    
Context:
    
    {
        name: "John Dow"
        lambda: function() {
            return function(context, callback) {
                callback(undefined, function(data, context, callback) {
                    setTimeout(function(){
                        callback(data.toUpperCase());
                    }, 300);
                });
            };
        }
    }
        
Output:
    
    LAMBDA CONTENTS JOHN DOW.
    
Another tricky code. Lets explain it. As in previous examples, the function 
returns a function that takes two arguments: local context and callback. 
Callback in turn receives another two arguments: Error and Handler.

Handler will be called after all the contents of lambda is generated. Handler 
takes three arguments: data, context and another callback. Data is previously 
generated output. Context ... is context. And finally another callback takes 
only one argument - transformed data.

## Compile-phase operations

As the name implies, compile-phase operations are executed on the phase of 
compilation.

### Template overrides

Template overrides come from Django Templating. You can think of them as stack 
of layers.

Overrides defines by blocks that begins with a plus sign `+` and ends with a 
slash `/`. Blocks can not be nested. Also you need provide tag with smaller 
sign `<` and relative path to base template.  

Syntax of override template:
    
    {{< relative/path/to/base.template}}
    
    {{+ block}}
        Override contents
    {{/ block}}
    
And in base template you must define blocks:

    Start of base template
    {{+ block}}
        Base contents
    {{/ block}}
    {{+ another_block}}
        Base contents of another block
    {{/ another_block}}
    
If base template is executed itself, block tags simply disappears.
    
Lets assume previous code as "base.html" and define two another templates:

override-one.html:

    {{< base.html}}
    
    {{+ block}}
        Override ONE contents
    {{/ block}}
    
    {{+ another_block}}
        Override ONE contents of another block
    {{/ another_block}}
    
And override-two.html:

    {{< override-one.html}}
    
    {{+ block}}
        Override TWO contents
    {{/ block}}
    
Result of execution base.html:

    Start of base template
        Base contents
        Base contents of another block

Result of execution override-one.html:

    Start of base template
        Override ONE contents
        Override ONE contents of another block
        
And finally, result of exetution override-two.html:

    Start of base template
        Override TWO contents
        Override ONE contents of another block

At first glance work with overrides can seem a bit messy, but you can find them 
quite useful.

### Template partials

Partials similar to partials in Mustache, but executed on a compilation phase. 
Syntax is same: partial tag defined with a greater than sign `>` and relative 
path to partial. Partials can be recursive.

template.html

    Start
    {{> partial.html}}
    End
    
partial.html

    Partial contents
    
And result of execution template.html:

    Start
    Partial contents
    End

### Filters

Compile-phase filters are executed on the phase of compilation after 
application of overrides and expansion of partials. Compile-phase filters 
affect all the static template code which they frame. A filter begins with 
a tilde `~` and ends with a slash `/`.

Lets execute template with imaginary "toUpperCase" filter:

    {{~toUpperCase}}
        Name is {{name}}
    {{/toUpperCase}}
    
Provide JSON:

    {
        name: "John Dow"
    }
    
And get the following result:

    NAME IS John Dow

As we see, "John Dow" stays in him original case. It happened because the 
lookup operation was carried out at the runtime phase.

#### Default filters

Nun includes number basic filters:

* `escape` - Escapes all HTML-specific characters.
* `compress` - Compresses all multiple spaces to single, trims lines and 
  replaces multiple line endings with single.
  
#### Third-party filters

* [nun-v](http://github.com/akaspin/nun-v) - Static content versioning

#### Custom filters

You can define your own filters. To do this, place them in the section "filters"
in the options. For example, imaginary "toUpperCase" may be defined by 
following way:

    var filters = {
        toUpperCase: function(data, callback) {
            callback(undefined, data.toUpperCase());
        }
    }
    nun.render("file", {}, {filters:filters}, ...);

As we see, *toUpperCase* is standart asynchronous function that takes two 
arguments: data and callback. Data is static code fragment. The filter will be 
executed for each static code fragment. Callback is a function that takes two
arguments: Error and warped code fragment.

You can also provide parameters to filters. Just include them in set:

    var filters = {
        wrap: function(data, callback) {
            callback(undefined, 
                    this.wrapOptions.opener + 
                    data +
                    this.wrapOptions.closer);
        },
        wrapOptions: {
            opener: "<",
            closer: ">"
        }
    }
    
    nun.render("file", {}, {filters:filters}, ...);

Template:

    {{~wrap}}some text{{/wrap}}

Output:

    <some text>
    
### Tag shapeshifting

Tag shapeshifting, according to *ctemplate*, this "is useful for languages 
like TeX, where double-braces may occur in the text and are awkward to use 
for markup."

Tag Shapeshifter start with an equal `=` sign and change the tag delimiters 
from `{{` and `}}` to custom strings.

Example from Mustache:

    * {{default_tags}}
    {{= <% %>}}
    * <% erb_style_tags %>
    <%={{ }}%>
    * {{ default_tags_again }}
    
Regardless of the enclosure, each template starts to be processed with default
tags shape. For example, two following templates are working correctly:

template.html

    {{= <% %>}}
    <% > partial.html%>
    <%some.test.key%>
    
partial.html

    {{in.partial}}
    
## Compile-phase options

You can set some compile-phase options.

### Template caching

By default *nun* caching all compiled templates. To disable caching fo template
you can set `options.cache` parameter to `false`.

    nun.render(__dirname + "/file.html", {}, { cache: false }, ...);
    
If you set different options for one template file, *nun* caching will consider 
them as two different templates. This only working if *node.js* compiled with
openssl support. Without openssl support, templates cached only for file name.

### Compressing whitespace

By default *nun* don't compressing whitespace. Instead set `compress` 
compile-phase filters, you can compress all whitespace in template by setting 
`options.compress` parameter to `true`.

    nun.render(__dirname + "/file.html", {}, { compress: true }, ...);
    
## Why Nun...

### Uses absolute paths?

For independence. For example, if you write your library using *nun*, a single 
global way will only interfere. 

### ... is Nun?

Nun architecture a bit similar to Mu. "Nun" is the letter of the Phoenician 
alphabet, corresponding to the Greek "Nu", which follows the "Mu".
 

