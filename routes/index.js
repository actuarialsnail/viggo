var express = require('express');
var router = express.Router();
var mongodb = require('mongodb');

// /* GET home page. */
// router.get('/', function(req, res, next) {
//   res.render('index', { title: 'Express' });
// });


// //ws testing
// var app = require('express')();
// var http = require('http').Server(app);
// var io = require('socket.io')(http);

// app.get('/ws', function(req, res){
//   res.render('ws',{title: "ws test"});
// });

// io.on('connection', function(socket){
//   console.log('a user connected');
// });

// http.listen(3000, function(){
//   console.log('listening on *:3000');
// });


//hjs testing
router.get('/',function(req,res){
	res.render('index',{
		title: 'My testing App!',
		author: 'YF'
	});
});

//mongo testing
router.get('/thedata',function(req,res){
	var MongoClient = mongodb.MongoClient;
	var url = 'mongodb://localhost:27017/test1';
	MongoClient.connect(url,function(err,db){
		if(err){
			console.log('Unable to connect to server',err);
		} else {
			console.log('Connection established');
			var collection = db.collection('test1');

			collection.find({}).toArray(function(err,result){
				if (err){
					res.send(err);
				} else if (result.length){
					res.render('namelist',{
						"data": result
					});
				} else {
					res.send('No doc found');

				db.close();
				}
			});
		}

	});
});

module.exports = router;
