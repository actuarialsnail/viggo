var express = require('express');
var app = express();
var server = require('http').createServer(app);
var path = require('path');
var io = require('socket.io').listen(server);
var mongodb = require('mongodb');
var router = express.Router();
var async = require("async");

var port = process.env.PORT || 3000;

server.listen(port, function(){
  console.log('listening on *:'+port);
});

users = [];
connections = [];


//initialise database
var MongoClient = mongodb.MongoClient;
//var url = 'mongodb://localhost:27017/mapDB';
//var url = 'mongodb://hngyix001:hngyix001@ds050879.mlab.com:50879/viggo'
var url = 'mongodb://hngyix001:hngyix001@ds113938.mlab.com:13938/viggo_db';

//specify static directory
app.use(express.static('public'));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');

app.get('/', function(req, res){
	res.render('viggo',{
		//parses no data on page initialisation
	}); 
    //newUserDBConnect(req,res);
    //console.log(db_result);
    //res.sendFile(__dirname + '/index.html');
});


function lobbyUpdate(id){
  	MongoClient.connect(url,function(err,db){
		if (err) {console.log('Unable to connect to server',err);
		} else {
			console.log('Connection established... lobby status update');
			db.listCollections().toArray(function(err, colNames) {
			  if (err) return  console.log(err);
			  //console.log(colNames);
			  var obj={};
			  var keeplooking = true;
			  async.each(colNames,
			  	function(colName,callback){
			  		if(colName.name=="system.indexes"){callback();} //skip this system admin collection automatically created by cloud servers
			  		else{
				  		var collection = db.collection(colName.name);
				  		collection.find({controlleduser:{$eq:""}}).sort({'name':1}).toArray(function(err,result){
							
							var freeRegion=[];
							for (var i in result){
								freeRegion.push(result[i].name);
							}
							collection.distinct('controlleduser', function(err,distinctUsers){
								obj[colName.name+': '+(distinctUsers.length-1)+' playing']=freeRegion; //array of regions not taken and playes in the server
								//console.log(obj);
								callback();		
							});						
						});
				  	}
			  	}, function(err){
			  		db.close();
			  		io.sockets.in(id).emit('sent latest lobby status',obj);//send lobby status
			  		//console.log(obj);
			  	}
			  
			  );//async each loop
			  
			}); //getCollectionNames - for each collection in the list
		}
	});
}

function newUserDBConnect(username, iniServer, iniCountry, socket){
	
	MongoClient.connect(url,function(err,db){
		if(err){ console.log('Unable to connect to server',err);
		} else {
			console.log('Connection established');
			
			db.listCollections().toArray(function(err, colNames) {
			  if (err) return  console.log(err);
			  console.log(colNames);
			  var i = 0;	
			  var keeplooking = true;
			  async.whilst(
			  	function(){	//condition function
			  		return keeplooking;
			  	},
			  	function(callback){ //iterate function for each collection
			  		//somwhow deal with "system.indexes" need to skip system collections

			  		var collection = db.collection(colNames[i].name);
					collection.find().toArray(function(err,result){
						if (err){console.log(err);				
						} else if (result.length){
							//check if country and username found in collection
							var id=-1; 
							var uniqueUsername=true; 
							var valArr=[];
							for (var item in result){
								if (result[item].controlleduser == username) {uniqueUsername=false;}
								if (result[item].name == iniCountry && result[item].controlleduser == "") {id=item;}
								valArr.push(result[item].value);
							}
							//if username not taken && country found with no user
							if (uniqueUsername && id != -1){
								console.log("username not taken in "+colNames[i].name);
								
								for(var j=1;j<=valArr.length+1;j++) { //recycle color axis values array
								    if(valArr.indexOf(j) == -1){var x=j;break;}
								}
								
								collection.update( //update inside the callback due to asynchronous flow
									{name:iniCountry},
									{$set: {datavalue:100, controlleduser: username, value: x}}
								);  //update target area value
								
								socket.join(colNames[i].name);
								io.sockets.in(colNames[i].name).emit('initiate map', {colName: colNames[i].name});
								keeplooking=false;
								db.close();
								callback();
							}														
							else {	console.log("username taken in "+colNames[i].name + " iteration: "+i);
									if (i == (colNames.length-1)){  //if username taken in all existing collections then create and assign in next collection
										var newColName = colNames[i].name.replace(/\d+$/, function(n){ return ++n });
										//var oldCollection = db.collection(colNames[i].name);
										var newCollection = db.collection(newColName);
										console.log("New collection created: "+newColName);
																					
										var newResult = result;
										//console.log(newResult);
										for (var d in newResult){
											if (iniCountry == newResult[d].name){
											 newResult[d].datavalue=100; newResult[d].controlleduser=username; newResult[d].value=1;
											} else {
											 newResult[d].datavalue=0; newResult[d].controlleduser=""; newResult[d].value=0;	
											}
										}
										newCollection.insert(newResult);
										socket.join(newColName);
										io.sockets.in(newColName).emit('initiate map', {colName: newColName});
										keeplooking=false;
										db.close();
										callback();
																					
									} else {console.log("next colname");i++;callback();}
								 }
								//io.sockets.emit('reset submit', {username: username, msg: "Country already taken, please pick another"});
								//db.close();
						
						} else {
							console.log('No doc found');
							db.close();
						}
					});//collection update
			  	},
			  	function (err, result){ // callback function is not needed for now
			  	}
			  );//async whilst loop
			}); //getCollectionNames - for each collection in the list
		}
	});
}

var timerInstance=0; // timeInterval timer
timerInstance = setInterval(function() {
	MongoClient.connect(url,function(err,db){
		if(err){
			console.log('Unable to connect to server',err);
		} else {
			//console.log('Connection established... timer update');
			db.listCollections().toArray(function(err, colNames) {
				async.each(colNames, 
				function(colName, callback){
					var collection = db.collection(colName.name);
					collection.distinct('controlleduser', function(err,distinctUsers){
						//console.log(distinctUsers);
						if (distinctUsers.length>2 && colName.name!="system.indexes"){// "" is one, 1st user is two
							collection.update(
								{controlleduser:{$ne:""}},
								{$inc: {datavalue:+10}},
								{multi: true}
							);
							//io.sockets.in(colName.name).emit('post timestep update', {colName:colName.name});
							io.sockets.emit('post timestep update', {colName:colName.name}); //send to all to avoid missing updates due to reconnection
							console.log(Date()+": up troops by 5");
						} 
						callback();
					});				
				}, function(err){
					 db.close();
			
				});
			});
		}
	});
}, 10000 );

function newUserRequest(username, iniServer, iniCountry, socket){
	
	MongoClient.connect(url,function(err,db){
		if (err) {console.log('Unable to connect to server',err);
		} else {
			console.log('Connection established... new user eligibility check');
			var colName = iniServer.split(':')[0];
			var collection = db.collection(colName);
			console.log(iniServer.split(':')[0]);
			//check if country is taken
			collection.find({}).toArray(function(err,result){
				var id=-1; 
				var uniqueUsername=true; 
				var valArr=[]; //color axis value array
				for (var item in result){
					if (result[item].controlleduser == username) {uniqueUsername=false;}
					if (result[item].name == iniCountry && result[item].controlleduser == "") {id=item;}
					valArr.push(result[item].value); //color axis value array
				}
				//if username not taken && country found with no user
				if (uniqueUsername && id != -1){
					console.log("username not taken in "+colName);
					
					for(var j=1;j<=valArr.length+1;j++) { //recycle color axis values array
					    if(valArr.indexOf(j) == -1){var x=j;break;}
					}
					
					collection.update( //update inside the callback due to asynchronous flow
						{name:iniCountry},
						{$set: {datavalue:100, controlleduser: username, value: x}}
					);  //update target area value
					
					socket.join(colName);
					socket.username = username;
					io.sockets.in(colName).emit('initiate map', {colName: colName});
					db.close();
				} else {
					socket.username = username;
					io.sockets.in(socket.id).emit('user requested slot taken', {colName: colName});
					db.close();
				}				
			}); //user specified collection
		}
	});
}


//io socket
io.sockets.on('connection', function(socket){
    
  connections.push(socket);

  io.sockets.in(socket.id).emit('welcome client side connection','Welcome! '+socket.id);//send welcome message, triggers lobby update on client side too
  
  //io.sockets.in(socket.id).emit('lobby update required','Lobby');//send welcome message
  console.log('Connected: %s sockets connected', connections.length);

  //disconnecting (event prior to disconnect where info is held)
  socket.on('disconnecting',function(){
  	var rooms = socket.rooms;
  	var room = rooms[Object.keys(rooms)[Object.keys(rooms).length-1]];
  	console.log(socket.username + " has logged off from "+room);
  	MongoClient.connect(url,function(err,db){
			if(err){
				console.log('Unable to connect to server',err);
			} else {
				console.log('Connection established... clear user game data');
				var collection = db.collection(room);
				collection.update(
					{controlleduser:socket.username},
					{$set: {value:0, datavalue:0, controlleduser:""}},
					{multi: true}
				);

				collection.find({}).toArray(function(err,result){
					io.sockets.in(room).emit('post timestep update',{colName:room});
					io.sockets.emit('lobby updated',"");
					db.close(); //inside the last callback since it's asynchronous
				});
			}
		});

  });

  // Disconnect (leaveAll means no data can be found anymore)
  socket.on('disconnect', function(data){
  	//if (!socket.username) return;
  	users.splice(users.indexOf(socket.username),1);
  	connections.splice(connections.indexOf(socket),1);
    console.log('Disconnected: %s sockets connected', connections.length);
    // if (users.length==0){
    // 	clearInterval(timerInstance);
    // }
  });
  

  socket.on('request update lobby', function(){
  	lobbyUpdate(socket.id);
  });

  // Send message
  socket.on('send message', function(data){
    io.sockets.in(data.colName).emit('new message', {msg: data.msg, user:data.username, colName:data.colName});
    //console.log({msg: data.msg, user:data.username, colName:data.colName});
  });

  // New user
  socket.on('new user request', function(data){
    
    // callback(true);
    
    users.push(socket.username);
    //newUserDBConnect(data.username, data.iniServer, data.iniCountry, socket);
    newUserRequest(data.username, data.iniServer, data.iniCountry, socket);
    io.sockets.emit('lobby updated',"");
  });

  socket.on('click area', function(data){
  	// emit back activity
	io.sockets.in(data.colName).emit('select area', {area_id:data.id, colName:data.colName});
  });

  socket.on('transfer area data values',function(data){
  	var targetArea_id = "";
  	var targetArea_datavalue=0;
  	var targetArea_user = "";
  	var targetArea_colorAxisValue = 0;
  	var msg="";
  	// update database
  	MongoClient.connect(url,function(err,db){
		if(err){
			console.log('Unable to connect to server',err);
		} else {
			console.log('Connection established... transfer value: '+data.datavalue+" from: "+data.sourceArea+" to "+data.targetArea +" color: "+ data.colorAxisValue +" in collection: "+data.colName);
			var collection = db.collection(data.colName);
			var sourceArea_colorAxisValue = 0;
			for (var index in data.sourceArea){
	            collection.update(
					{id:data.sourceArea[index].id},
					{$inc: {datavalue:-data.sourceArea[index].datavalue}}
				);  //update source area value
	            //console.log(data.sourceArea[index].id);
	            sourceArea_colorAxisValue=data.sourceArea[index].colorAxisValue;
	        }
			
			// check if target value belongs to user or not, assign values accoridngly
			collection.find({name:data.targetArea}).toArray(function(err,result){
				if (err){
					console.log(err);
				} else if (result.length){
					
					targetArea_id = result[0].id;
					if (result[0].controlleduser == data.controlleduser){ //self transfer
						targetArea_user = data.controlleduser;
						targetArea_datavalue = Math.max(Number(result[0].datavalue) + Number(data.datavalue),1);
						targetArea_colorAxisValue = sourceArea_colorAxisValue;
						msg = data.controlleduser+" transferred troops";
					} else if (Number(data.datavalue) > Number(result[0].datavalue)){ //vicotry
						targetArea_user = data.controlleduser;
						targetArea_datavalue = Math.max(Number(data.datavalue) - Number(result[0].datavalue),1);
						targetArea_colorAxisValue = sourceArea_colorAxisValue;
						msg = data.controlleduser+" successfully invaded "+data.targetArea;
					} else {													//defeat
						targetArea_user = result[0].controlleduser; 
						targetArea_datavalue = Math.max(Number(result[0].datavalue) - Number(data.datavalue),1);
						targetArea_colorAxisValue = result[0].value;
						msg = data.controlleduser+" failed to invade "+data.targetArea;
					}
					
					collection.update( //update inside the callback due to asynchronous flow
						{name:data.targetArea},
						{$set: {datavalue:targetArea_datavalue,
								controlleduser: targetArea_user,
								value:targetArea_colorAxisValue}
						}
					);  //update target area value
					
					collection.update(
						{},
						{$max: {datavalue:0}},
						{multi:true}
					);  //update to avoid negative databalue due to timing of server request from clients on source datavalues

					//emit data saying the client should request data update
					io.sockets.in(data.colName).emit('transfer area data value completed',{colName:data.colName, msg:msg, controlleduser:data.controlleduser});
					//emit data for area select
					//io.sockets.in(data.colName).emit('select area', {area_id:targetArea_id, colName:data.colName}); 
					//to delete: there was a timing issue with data transfer and select, actually dont need to show activity via click, the data update automatically allows for this

					db.close(); //inside the last callback since it's asynchronous
					console.log('Completed... transferred value: '+data.datavalue+" from: "+data.sourceArea+" to "+data.targetArea +" color: "+ data.colorAxisValue +" in collection: "+data.colName);
				} else {
					console.log('No doc found');
					db.close(); //inside the last callback since it's asynchronous
				}
			});
		}	
	});
  });
  
  socket.on('request server side update',function(data){
  	//query and load data from mongodb
  	MongoClient.connect(url,function(err,db){
		if (err) {console.log('Unable to connect to server',err);
		} else {
			console.log('Connection established... submitting client requested data');
			var collection = db.collection(data.colName);
			
			collection.find({}).toArray(function(err,result){
				io.sockets.in(data.colName).emit('sent update to client side', {colName: data.colName, result: result});
				db.close(); //inside the last callback since it's asynchronous
			});
		}
	});
  });

});



