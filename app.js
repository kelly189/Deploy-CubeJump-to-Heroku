//var mongojs = require("mongojs");
var db = null;//mongojs('localhost:27017/myGame', ['account','progress']);

var express = require('express');
var app = express();
var serv = require('http').Server(app);
var io = require('socket.io')(serv,{});
var SAT = require('sat');

app.get('/',function(req, res) {
	res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

serv.listen(process.env.PORT || 2000);
console.log("Server started.");

var SOCKET_LIST = {};
var colors = ['#bf00ff', '#00fffa', '#ff00d4', '#00ff55', '#83ff00', '#ff003b', '#3f00ff', '#16ffeb', '#4fffcd', '#00ffb6', '#7f00ff', '#ffbf00', '#eeff00'];
var massNum = 0;
var lowerBound = 100;
var upperBound = 13300;
var leaderboard = [];
var leaderboardChanged = false;
var WIDTH;
var HEIGHT;

var Entity = function(param){
	var self = {
		x:Math.random() * 10000,
		y:250,
		spdX:0,
		spdY:0,
		id:"",
		color:colors[Math.floor(Math.random() * 13)],
	}
	if(param){
		if(param.x)
			self.x = param.x;
		if(param.y)
			self.y = param.y;
		if(param.id)
			self.id = param.id;		
	}
	
	self.update = function(){
		self.updatePosition();
	}
	self.updatePosition = function(){
		self.x += self.spdX;
		self.y += self.spdY;
	}
	self.getDistance = function(pt){
		return Math.sqrt(Math.pow(self.x-pt.x,2) + Math.pow(self.y-pt.y,2));
	}
	return self;
}

var Player = function(param){
	var self = Entity(param);
	self.number = "" + Math.floor(10 * Math.random());
	self.username = param.username;
	self.pressingRight = false;
	self.pressingLeft = false;
	self.pressingSpace = false;
	self.maxSpd = 10;
	self.deg = 0;
	self.width = 24;
	self.height = 24;
	self.ground = 262;
	self.maxWidth = 500;
	self.score = 0;
	self.angle = 45;
	self.accY = 0.5;
	self.gameOver = false;
	self.angle = 60;
	self.vel = 0.0315*self.width + 9.24;
	self.velX = self.vel * Math.cos(self.angle*(Math.PI/180));
	self.velY = self.vel * Math.sin(self.angle*(Math.PI/180));
	self.deltaDeg = 10;
	self.scale = -self.width*0.0021 + 2.05;
	
	var super_update = self.update;
	self.update = function(){
		self.updateSpd();
		super_update();
		self.createMass();
		
		if(self.score >= 24 && self.width < self.maxWidth){
			self.width = self.score/2 + 12;
			self.height = self.width;
		}else if(self.width > self.maxWidth)
			self.width = self.maxWidth;
			

		for(var i in Player.list){
			var p = Player.list[i];
			if(p.gameOver != true && (self.getDistance(p) <= self.getCollisionDist(p)) && self.id !== p.id && self.spdY > 0 && p.isOnGround(p) && self.collideTop(p)){
				var attacker = Player.list[self.id];
				if(attacker){
					attacker.score += p.width;
					self.vel = 0.0315*self.width + 9.24;
					self.velY = self.vel * Math.sin(self.angle*(Math.PI/180));
					self.launch();
					p.gameOver = true;
					SOCKET_LIST[p.id].emit('gameOver');
				}
			}
		}
		for(var i in Mass.list){
			var b = Mass.list[i];
			if(self.getDistance(b) < self.getCollisionDist(b) && self.spdY > 0){
				Player.list[self.id].score += 4;		
				Mass.list[i].toRemove = true;
			}
		}		
	}
	self.collideTop = function(p){
		if(self.height/2 + self.y <= p.y - p.height/2)
			return true;
		return false;
	}
	
	
	self.getGroundY = function(){
		groundY = self.ground - self.width/2;
		return groundY;
	}
	
	self.getCollisionDist = function(p){
	//	var dist = 139/238 * (self.width + p.width) + 3900/119;
	//	var dist = Math.sqrt(Math.pow(p.width*p.scale,2)+Math.pow(self.width*self.scale,2),2);
		var dist = p.width/2*self.scale + self.width/2*self.scale; //works
		//var dist = (p.width * Math.sqrt(2,2))/2 + (self.width * Math.sqrt(2,2))/2;
		//var dist = self.width*Math.sqrt(2,2);
		return dist;
	}
	
	self.isRolling = function(){
		var rolling = true;
		if(self.spdX == 0)
			rolling = false;
		return rolling;
	}
	
	self.createMass = function(){
		if(massNum < 100){
			massNum++;
			Mass({
				parent:self.id,
				x:Math.random() * upperBound,
				y:253,
			});
		}
	}
	self.updateSpd = function(){
		if(self.pressingRight || (self.isNotFinishedRotating() && (self.spdX < 0))){
			self.spdX = -self.maxSpd;
			self.deg -= 10;
			self.deltaDeg = -10;
			self.velX = -self.vel * Math.cos(self.angle*(Math.PI/180));
		}else if(self.pressingLeft || (self.isNotFinishedRotating() && (self.spdX > 0))){
			self.spdX = self.maxSpd;
			self.deg += 10;
			self.deltaDeg = 10;
			self.velX = self.vel * Math.cos(self.angle*(Math.PI/180));
		}else if(self.isOnGround(self)){
			self.spdX = 0; 
			self.deg = 0;
			self.velX = 0;
		}
		
		if(self.x < lowerBound)
			self.x = lowerBound
		else if(self.x > upperBound)
			self.x = upperBound
		
	//	if(self.isOnGround(self.y) && self.deg % 90 != 0)
	//		self.y -= 0.5;
	//	else if(self.isOnGround(self.y))
	//		self.y = self.getGroundY();
		
	//	if(self.x > 500){
	//		self.x = 500;
	//	}else if(self.x < -500){
	//		self.x = -500;
	//	}
	
		if(self.gameOver){
			self.spdX = 0; 
			self.deg = 0;
			self.velX = 0;		
		}
		
		if(self.pressingSpace || (self.y < self.getGroundY())){
			self.launch();
			
		}if(self.y > self.getGroundY()){
			self.y = self.getGroundY();
			self.spdX = 0;
			self.spdY = 0;
			self.velY = self.vel * Math.sin(self.angle*(Math.PI/180));			
		}
	}
	
	self.launch = function(){
		if(!self.gameOver){
			self.spdX = self.velX;
			self.spdY = -self.velY;
			self.velY += -self.accY;
			self.deg += self.deltaDeg;
	//		if(self.y == self.getGroundY){
	//			window.setTimeout()
	//		}
		}
	}
	
	self.isOnGround = function(p){
		if((p.y+p.width/2) == self.ground)
			return true;
		else
			return false;
	}
	
	self.isNotFinishedRotating = function(){
		if(self.deg % 90 == 0)
			return false;
		else
			return true;	
	}
	
	self.getInitPack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,	
			username:self.username,
			number:self.number,	
			deg:self.deg,
			scale:self.scale,
			color:self.color,
			gameOver:self.gameOver,
			width:self.width,
			height:self.height,
			score:self.score,
		};		
	}
	self.getUpdatePack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,
			deg:self.deg,
			gameOver:self.gameOver,
			width:self.width,
			height:self.height,
			score:self.score,
		}	
	}
	
	Player.list[self.id] = self;
	
	initPack.player.push(self.getInitPack());
	return self;
}
Player.list = {};
Player.onConnect = function(socket,username){
	var player = Player({
		username:username,
		id:socket.id,
	});
	socket.on('keyPress',function(data){
		if(data.inputId === 'left')
			player.pressingLeft = data.state;
		else if(data.inputId === 'right')
			player.pressingRight = data.state;
		else if(data.inputId === 'space')
			player.pressingSpace = data.state;
	});
	
	socket.emit('init',{
		selfId:socket.id,
		player:Player.getAllInitPack(),
		mass:Mass.getAllInitPack(),
	})
}

Player.getAllInitPack = function(){
	var players = [];
	for(var i in Player.list)
		players.push(Player.list[i].getInitPack());
	return players;
}

Player.onDisconnect = function(socket){
	delete Player.list[socket.id];
	removePack.player.push(socket.id);
}
Player.update = function(){
	var pack = [];
	for(var i in Player.list){
		var player = Player.list[i];
		player.update();
		if (leaderboardChanged) {
            SOCKET_LIST[player.id].emit('leaderboard', {
                players: Player.list.length,
                leaderboard: leaderboard
            });
        }
	//	if(player.gameOver){
		//	delete Player.list[i];
		//	removePack.player.push(player.id);
	//	}else
			pack.push(player.getUpdatePack());		
	}
	return pack;
	leaderboardChanged = false;
}


var Mass = function(param){
	var self = Entity(param);
	self.id = Math.random();
	self.parent = param.parent;
	self.width = 12;
	
	self.toRemove = false;
	var super_update = self.update;
	self.update = function(){
		super_update();	
	}
	self.getInitPack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,
			color:self.color,
			width:self.width,
		};
	}
	self.getUpdatePack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,		
		};
	}
	
	Mass.list[self.id] = self;
	initPack.mass.push(self.getInitPack());
	return self;
}
Mass.list = {};

Mass.update = function(){
	var pack = [];
	for(var i in Mass.list){
		var mass = Mass.list[i];
		if(mass.x > upperBound || mass.x < lowerBound)
			mass.toRemove;
		mass.update();
		if(mass.toRemove){
			delete Mass.list[i];
			massNum--;
			removePack.mass.push(mass.id);
		} else
			pack.push(mass.getUpdatePack());		
	}
	return pack;
}

Mass.getAllInitPack = function(){
	var mass = [];
	for(var i in Mass.list)
		mass.push(Mass.list[i].getInitPack());
	return mass;
}

function gameloop() {
    if (Player.list.length > 0) {
        Player.list.sort( function(a, b) { return b.score - a.score; });

        var topPlayers = [];

        for (var i = 0; i < Math.min(10, Player.list.length); i++) {
            if(Player.list[i]) {
                topPlayers.push({
                    id: Player.list[i].id,
                    username: Player.list[i].username
                });
            }
        }
        if (isNaN(leaderboard) || leaderboard.length !== topPlayers.length) {
            leaderboard = topPlayers;
            leaderboardChanged = true;
        }
        else {
            for (i = 0; i < leaderboard.length; i++) {
                if (leaderboard[i].id !== topPlayer.list[i].id) {
                    leaderboard = topPlayer.list;
                    leaderboardChanged = true;
                    break;
                }
            }
        }
    }
}

var DEBUG = true;

var isValidPassword = function(data,cb){
	return cb(true);
	/*db.account.find({username:data.username,password:data.password},function(err,res){
		if(res.length > 0)
			cb(true);
		else
			cb(false);
	});*/
}
var isUsernameTaken = function(data,cb){
	return cb(false);
	/*db.account.find({username:data.username},function(err,res){
		if(res.length > 0)
			cb(true);
		else
			cb(false);
	});*/
}
var addUser = function(data,cb){
	return cb();
	/*db.account.insert({username:data.username,password:data.password},function(err){
		cb();
	});*/
}

io.sockets.on('connection', function(socket){
	socket.id = Math.random();
	SOCKET_LIST[socket.id] = socket;
	
	socket.on('startGame',function(data){
		Player.onConnect(socket,data.username);
		socket.emit('startGameResponse',{success:true});
		WIDTH = data.width;
		HEIGHT = data.height;
	});
	
	socket.on('disconnect',function(){
		delete SOCKET_LIST[socket.id];
		Player.onDisconnect(socket);
	});
	
	socket.on('evalServer',function(data){
		if(!DEBUG)
			return;
		var res = eval(data);
		socket.emit('evalAnswer',res);		
	});
	
	
	
});

var initPack = {player:[],mass:[]};
var removePack = {player:[],mass:[]};


setInterval(function(){
	var pack = {
		player:Player.update(),
		mass:Mass.update(),
	}
	
	for(var i in SOCKET_LIST){
		var socket = SOCKET_LIST[i];
		socket.emit('init',initPack);
		socket.emit('update',pack);
		socket.emit('remove',removePack);
	}
	initPack.player = [];
	initPack.mass = [];
	removePack.player = [];
	removePack.mass = [];
	
},1000/25);
setInterval(gameloop, 1000);

/*
var profiler = require('v8-profiler');
var fs = require('fs');
var startProfiling = function(duration){
	profiler.startProfiling('1', true);
	setTimeout(function(){
		var profile1 = profiler.stopProfiling('1');
		
		profile1.export(function(error, result) {
			fs.writeFile('./profile.cpuprofile', result);
			profile1.delete();
			console.log("Profile saved.");
		});
	},duration);	
}
startProfiling(10000);
*/







