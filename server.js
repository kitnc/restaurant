var express = require('express');
var session = require('cookie-session');
var bodyParser = require('body-parser');
var fileUpload = require('express-fileupload');
var app = express();
var SECRETKEY1 = 'ac';
var SECRETKEY2 = 'pw';
var http = require('http');
var url  = require('url');
var MongoClient = require('mongodb').MongoClient; 
var assert = require('assert');
var ObjectId = require('mongodb').ObjectID;
var mongourl = 'mongodb://project:123321@ds119446.mlab.com:19446/project';


app.set('view engine','ejs');
app.use(session({
  name: 'session',
  keys: [SECRETKEY1,SECRETKEY2]
}));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(fileUpload());

app.get('/',function(req,res,next) {
	if (!req.session.authenticated) {
		res.status(200);
		res.render('login');
	} else {
		res.redirect('/read');
	}
});

app.get('/login',function(req,res,next) {
	res.redirect('/');
});
app.post('/login',function(req,res,next) {
	MongoClient.connect(mongourl, function(err, db) {
		assert.equal(err,null);
		login(db,function(users) {
			db.close();
			if (users.length == 0) {
				res.redirect('/');
			} else {
				for (var i=0; i<users.length; i++) {
					if (users[i].id == req.body.id &&
		    	users[i].pw == req.body.password) {
						req.session.authenticated = true;
						req.session.username = users[i].id;
					}
				}
				res.redirect('/read');
			}
		}); 
	});
});
app.get('/logout',function(req,res,next) {
	req.session = null;
	res.redirect('/');
});

function login(db,callback) {
	var users = [];
	cursor = db.collection('account').find();
	cursor.each(function(err, doc) {
		assert.equal(err, null); 
		if (doc != null) {
			users.push(doc);
		} else {
			callback(users); 
		}
	});
}

app.get('/read',function(req,res,next) {
		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(err,null);
			var criteria = req.query;
			RestaurantsName(db,criteria,function(restaurants) {
				db.close();
				if (restaurants.length == 0) {
					res.status(200);
					res.render('read',{userid:req.session.username, restaurant:restaurants});
				} else {
					res.status(200);
					res.render('read',{userid:req.session.username, restaurant:restaurants});
				}
			}); 
		});
});

function RestaurantsName(db,criteria,callback) {
	var restaurants = [];
	cursor = db.collection('restaurants').find(criteria,{name:1}); 				
	cursor.each(function(err, doc) {
		assert.equal(err, null); 
		if (doc != null) {
			restaurants.push(doc);
		} else {
			callback(restaurants); 
		}
	});
}

app.get('/new',function(req,res,next){
		res.status(200);
		res.render('new');
});

app.post('/create',function(req,res,next){
		new_r = {};
		var address = {};
		var coord = [];
		new_r['restaurant_id'] = (req.body.restaurant_id) ? req.body.restaurant_id : null;
		new_r['name'] = (req.body.name) ? req.body.name : "";
		new_r['borough'] = (req.body.borough) ? req.body.borough : "";
		new_r['cuisine'] = (req.body.cuisine) ? req.body.cuisine : "";
		address['street'] = (req.body.street) ? req.body.street : "";
		address['building'] = (req.body.building) ? req.body.building : "";
		address['zipcode'] = (req.body.zipcode) ? req.body.zipcode : "";
		(req.body.lon) ? coord.push(req.body.lon) : coord.push("");
		(req.body.lat) ? coord.push(req.body.lat) : coord.push("");
		address['coord'] = coord;
		new_r['address'] = address;
		new_r['grades'] = [];
		new_r['owner'] = req.session.username;
		if(req.files.sampleFile){
			new_r['mimetype'] = req.files.sampleFile.mimetype;
			new_r['photo'] = req.files.sampleFile.data.toString('base64');
			MongoClient.connect(mongourl, function(err, db) {
				assert.equal(null, err);
				insertDocument(db,new_r,function() {
					db.close();
					res.redirect('/read');
				});
			});
		}else{
			new_r['mimetype'] = "";
			new_r['photo'] = "";
			MongoClient.connect(mongourl, function(err, db) {
				assert.equal(null, err);
				insertDocument(db,new_r,function() {
					db.close();
					res.redirect('/read');
				});
			});
		}
});

function insertDocument(db,new_r,callback) {
	db.collection('restaurants').insertOne(new_r,function(err,result) {
		assert.equal(err,null);
		callback(result);
	});
}

app.get('/display',function(req,res,next){
		if(req.query._id){
			Rdisplay(res,req.query._id,function(doc){
				res.status(200);
				res.render('display',{restaurant:doc});
			});
		}
});

function Rdisplay(res,id,callback) {
	MongoClient.connect(mongourl, function(err, db) {
		assert.equal(err,null);
		db.collection('restaurants').
			findOne({_id: ObjectId(id)},function(err,doc) {
				assert.equal(err,null);
				db.close();
				callback(doc);
		});
	});
}

app.get('/gmap',function(req,res,next){
		res.status(200);
		res.render('gmap',{lat:req.query.lat,lon:req.query.lon,title:req.query.title});
});

app.get('/rate',function(req,res,next){
		res.status(200);
		res.render('rate',{id:req.query._id});
});

app.post('/rate',function(req,res,next){
		var update = {};
		var criteria = {};
		var grade = {};
		id = req.body._id;
		criteria['_id'] = ObjectId(req.body._id);
		update['user'] = req.session.username;
		update['score'] = req.body.score;
		grade['grades'] = update;
		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(null, err);
			GetRestaurant(db,criteria,function(restaurants) {
				db.close();
				if (restaurants[0].grades) {
					var checkuser = false;
					var rgrade = restaurants[0].grades;
					for(i in rgrade){
							if (rgrade[i].user == req.session.username){
								checkuser = true;
								break;
							}
					}
					if(!checkuser){
						MongoClient.connect(mongourl, function(err, db) {
							assert.equal(null, err);
							updateRate(db,id,grade, function() {
								db.close();
								res.redirect('/display?_id='+req.body._id);
							});
						});
					}else{
						res.status(500);
						res.render('errorrate');
					}
				} else {
					MongoClient.connect(mongourl, function(err, db) {
						assert.equal(null, err);
						updateRate(db,id,grade, function() {
							db.close();
							res.redirect('/display?_id='+req.body._id);
						});
					});
				}
			});		
		});
});


function updateRate (db,id,grade, callback) {
	db.collection('restaurants').updateOne(
		{_id: ObjectId(id)},
		{ $push: grade },
	function(err, results) {
		callback();
	});
};

function GetRestaurant(db,criteria,callback) {
	var restaurants = [];
	cursor = db.collection('restaurants').find(criteria); 				
	cursor.each(function(err, doc) {
		assert.equal(err, null); 
		if (doc != null) {
			restaurants.push(doc);
		} else {
			callback(restaurants); 
		}
	});
}

app.get('/remove',function(req,res,next){
		var criteria = {};
		criteria['_id'] = ObjectId(req.query._id);
		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(null, err);
			GetRestaurant(db,criteria,function(restaurants) {
				db.close();
				if (restaurants[0].owner == req.session.username) {
					MongoClient.connect(mongourl, function(err, db) {
						assert.equal(null, err);
						remove(db,criteria, function() {
							db.close();
							res.status(200);
							res.render('remove');
						});
					});
				} else {
					res.status(500);
					res.render('errorremove');
				}
			});		
		});
});

function remove(db,criteria, callback) {
	db.collection('restaurants').deleteOne(
		criteria,
		function(err, results) {
			callback();
		}
	);
};

app.get('/change',function(req,res,next){
		var criteria = {};
		criteria['_id'] = ObjectId(req.query._id);
		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(null, err);
			GetRestaurant(db,criteria,function(restaurants) {
				db.close();
				if (restaurants[0].owner == req.session.username) {
							res.status(200);
							res.render('change', {restaurants:restaurants[0],user:req.session.username});
				} else {
					res.status(500);
					res.render('errorchange');
				}
			});		
		});
});

app.post('/change',function(req,res,next){
		new_r = {};
		var criteria = {};
		var address = {};
		var coord = [];
		criteria['_id'] = ObjectId(req.body._id);
		new_r['restaurant_id'] = (req.body.restaurant_id) ? req.body.restaurant_id : null;
		new_r['name'] = (req.body.name) ? req.body.name : "";
		new_r['borough'] = (req.body.borough) ? req.body.borough : "";
		new_r['cuisine'] = (req.body.cuisine) ? req.body.cuisine : "";
		address['street'] = (req.body.street) ? req.body.street : "";
		address['building'] = (req.body.building) ? req.body.building : "";
		address['zipcode'] = (req.body.zipcode) ? req.body.zipcode : "";
		(req.body.lon) ? coord.push(req.body.lon) : coord.push("");
		(req.body.lat) ? coord.push(req.body.lat) : coord.push("");
		address['coord'] = coord;
		new_r['address'] = address;
		new_r['grades'] = [];
		new_r['owner'] = req.session.username;
		if(req.files.sampleFile){
			new_r['mimetype'] = req.files.sampleFile.mimetype;
			new_r['photo'] = req.files.sampleFile.data.toString('base64');
			MongoClient.connect(mongourl, function(err, db) {
				assert.equal(null, err);
				updateDocument(db,criteria,new_r,function() {
					db.close();
					res.redirect('/display?_id='+req.body._id);
				});
			});
		}else{
			MongoClient.connect(mongourl, function(err, db) {
				assert.equal(null, err);
				updateDocument(db,criteria,new_r,function() {
					db.close();
					res.redirect('/display?_id='+req.body._id);
				});
			});
		}
});


function updateDocument(db,criteria,new_r,callback) {
	db.collection('restaurants').updateOne(criteria,{$set:new_r},function(err,result) {
		assert.equal(err,null);
		callback(result);
	});
}

app.get('/api/restaurant/read/:x/:y',function(req,res,next){
		var criteria = {};
		if(req.params.x && req.params.y){
			criteria[req.params.x] = req.params.y;
		}
		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(null, err);
			GetRestaurant(db,criteria,function(restaurants) {
				db.close();
				if (restaurants.length == 0) {
					res.writeHead(200, {"Content-Type": "application/json"});
					var json = JSON.stringify({});
					res.end(json);
				} else {
					res.writeHead(200, {"Content-Type": "application/json"});
					var json = JSON.stringify(restaurants);
					res.end(json);
				}
			});		
		});
});

app.get('/api/restaurant/read',function(req,res,next){
		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(null, err);
			GetRestaurant(db,{},function(restaurants) {
				db.close();
				if (restaurants.length == 0) {
					res.writeHead(200, {"Content-Type": "application/json"});
					var json = JSON.stringify({});
					res.end(json);
				} else {
					res.writeHead(200, {"Content-Type": "application/json"});
					var json = JSON.stringify(restaurants);
					res.end(json);
				}
			});		
		});
});

app.post('/api/restaurant/create',function(req,res,next){
		new_r = {};
		new_r['restaurant_id'] = (req.body.restaurant_id) ? req.body.restaurant_id : null;
		new_r['name'] = (req.body.name) ? req.body.name : "";
		new_r['borough'] = (req.body.borough) ? req.body.borough : "";
		new_r['cuisine'] = (req.body.cuisine) ? req.body.cuisine : "";
		var address = {};
		address['street'] = (req.body.street) ? req.body.street : "";
		address['building'] = (req.body.building) ? req.body.building : "";
		address['zipcode'] = (req.body.zipcode) ? req.body.zipcode : "";
		var coord = [];
		(req.body.lon) ? coord.push(req.body.lon) : coord.push("");
		(req.body.lat) ? coord.push(req.body.lat) : coord.push("");
		address['coord'] = coord;
		new_r['address'] = address;
		new_r['grades'] = [];
		if(req.session.username){
			new_r['owner'] = req.session.username;
		}else if(req.body.owner){
			new_r['owner'] = req.body.owner;
		}else{
			new_r['owner'] = "";
		}
		new_r['mimetype'] = "";
		new_r['photo'] = "";
		if(new_r['name'] == "" || new_r['owner'] == ""){
			res.writeHead(200, {"Content-Type": "application/json"});
			var json = JSON.stringify({status: 'failed'});
			res.end(json);
		}else{
			MongoClient.connect(mongourl, function(err, db) {
				assert.equal(null, err);
				insertRESTful(db,new_r,function(id) {
				db.close();
				res.writeHead(200, {"Content-Type": "application/json"});
				var json = JSON.stringify({status: 'ok' , _id:id});
				res.end(json);
			});
			});
		}
});

function insertRESTful(db,new_r,callback) {
	db.collection('restaurants').insertOne(new_r,function(err,result) {
		assert.equal(err,null);
		if(err){
			res.writeHead(200, {"Content-Type": "application/json"});
			var json = JSON.stringify({status: 'failed'});
			res.end(json);
		}
		callback(result.ops[0]._id);
	});
}

app.listen(process.env.PORT || 8099);
