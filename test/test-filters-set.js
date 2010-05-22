var c = require("./common");

c.nun.setFilter('upper', function(data, callback) {
	callback(undefined, data.toUpperCase());
});

var filters = {
	wrap: function(data, callback) {
		callback(undefined, "<" + data + ">");
	}
};

c.test("filters", {}, {filters:filters});
