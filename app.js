//var mongojs = require("mongojs");
var db = null;//mongojs('localhost:27017/myGame', ['account','progress']);

var express = require('express');
var app = express();
var serv = require('http').Server(app);
var io = require('socket.io')(serv,{});
var $ = require('jquery');
//var paper = require('paper');
var SAT = require('sat');

process.setMaxListeners(0);

app.get('/',function(req, res) {
	res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

//app.use(express.logger());

serv.listen(process.env.PORT || 2000);
console.log("Server started.");

var V = SAT.Vector;
var B = SAT.Box;

var SOCKET_LIST = {};
var colors = ['#bf00ff', '#00fffa', '#ff00d4', '#00ff55', '#83ff00', '#ff003b', '#3f00ff', '#16ffeb', '#4fffcd', '#00ffb6', '#7f00ff', '#ffbf00', '#eeff00'];
var massNum = 0;
var lowerBound = 100;
var upperBound = 13300;
var leaderboard = [];
var leaderboardChanged = false;
var WIDTH;
var HEIGHT;
var users = [];

var Entity = function(param){
	var self = {
		x:Math.random() * upperBound,
		y:640,
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
	
	self.containsObject = function(obj, list){
		var i;
		for (i = 0; i < list.length; i++){
			if (list[i] === obj)
				return true;
		}
		return false;
	}
	
	self.getSATWidthHeight = function(player){
		var width = player.width * 2;
		var height = width;
		var wth;
		var hgt;
			
		if(player.launching){
			wth = width;
			hgt = height;
		}else if((player.dir == 'left' && ((player.deg < -90 && player.deg >= -180) || (player.deg >= 180 && player.deg < 270))) || (player.dir == 'right' && ((player.deg <= -90 && player.deg > -180) || (player.deg > 180 && player.deg <= 270)))){
			wth = width;
			hgt = height;
		}else if((player.dir == 'left' && ((player.deg < -180 && player.deg >= -270) || (player.deg >= 90 && player.deg < 180))) || (player.dir == 'right' && ((player.deg <= -180 && player.deg > -270) || (player.deg > 90 && player.deg <= 180)))){
			wth = -width;
			hgt = height;
		}else if((player.dir == 'left' && (((player.deg < -270 && player.deg >= -360) || player.deg == 0) || ((player.deg >= 0 && player.deg < 90) || player.deg == 360))) || (player.dir == 'right' && ((player.deg <= -270 && player.deg > -360) || (player.deg > 0 && player.deg <= 90)))){
			wth = -width;
			hgt = -height;
		}else if((player.dir == 'left' && ((player.deg < 0 && player.deg >= -90) || (player.deg >= 270 && player.deg < 360))) || (player.dir == 'right' && ((player.deg <= 0) || (player.deg > 270 && player.deg <= 360)))){
			wth = width;
			hgt = -height;
		}
		return {wth, hgt};
	}
	
	self.eatFood = function(mass, box){
		var width = mass.width * Player.list[box.id].scale;
		var height = width;
		var x = box.x - Player.list[box.id].x + WIDTH/2;
		var y = box.y - Player.list[box.id].y + HEIGHT/2;
		//var poly = new B(new V(x-width/2,y-height/2), width, height).toPolygon();
		var poly = new B(new V(mass.x,mass.y+height), width, height).toPolygon();
		var collided = SAT.testPolygonPolygon(self.getPolygon(box),poly);
		if(collided)
			return true;
		return false;
	}
	
	self.getPolygon = function(box){
		let {wth, hgt} = self.getSATWidthHeight(box);
		var x = box.x - Player.list[box.id].x + WIDTH/2;
		var y = box.y - Player.list[box.id].y + HEIGHT/2;
			
		var poly = new B(new V(box.x + box.width*2, box.y + box.height*2), wth,hgt).toPolygon();
		//var poly = new B(new V(x + box.width, y + box.height), wth,hgt).toPolygon();
		if(box.launching)
			poly.translate(-box.width,-box.height);
		poly.rotate(box.deg *  Math.PI/180);
		if(box.launching)
			poly.translate(-box.width,-box.height);
		poly.translate(box.num*box.width*2,0);
		poly.translate(-box.offsetX*box.width*2,0);
		return poly;
	}
	
	self.collided = function(box1, box2){
		var collided = SAT.testPolygonPolygon(self.getPolygon(box1),self.getPolygon(box2));
		if(collided)
			return true;
		return false;
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
	self.height = self.width;
	self.ground = 262;
	self.maxWidth = 1000;
	self.score = 0;
	self.accY = 0.5;
	self.gameOver = false;
	self.angle = 60;
	self.vel = 10;
	self.velX = self.vel * Math.cos(self.angle*(Math.PI/180));
	self.velY = self.vel * Math.sin(self.angle*(Math.PI/180));
	self.deltaDeg = 10;
	self.launching = false;
	self.lastDir = '';
	self.landed = false;
	self.maxY = 200;
	self.dir = '';
	self.lastDeg = 0;
	self.num = 0;
	self.prevDir = '';
	self.nameOffset = 0;
	self.launched = false;
	self.rem = 0;
	self.offset = 0;
	self.isBounded = true;
	self.oldX = self.x;
	self.launchX = 0;
	self.prevNum = self.num;
	self.val;
	self.offsetX = 0;
	self.scale = 1;
	
	var super_update = self.update;
	self.update = function(){
		self.updateScale();
		self.updateSpd();
		super_update();
		self.createMass();
		
		if(self.oldX != self.x){
			if(self.oldX < self.x){
				self.offset = self.x - self.oldX;
				self.offsetX += 1/9;
				self.nameOffset += 1/9;
			}else{
				self.offset = self.oldX - self.x;
				self.offsetX -= 1/9;
				self.nameOffset -= 1/9;
			}
			self.oldX = self.x;
		}else
			self.offset = 0;
			
		self.prevDir = self.dir;
		
		if(self.pressingLeft && self.pressingRight)
			self.dir = 'right';
		else if(self.pressingRight)
			self.dir = 'right';
		else if(self.pressingLeft)
			self.dir = 'left';
		
		if(self.prevDir != self.dir && self.prevDir != '' && self.launching != true && self.lastDeg % 90 == 0){
			if(self.dir == 'left'){
				self.num++;
			}else if(self.dir == 'right')
				self.num--;
		}
		
		if(self.launched){
			self.launched = false;
			self.launchX = self.x;
			//if(self.dir = 'left' && self.lastDeg <= 0){
			//	self.num++;
			//	if(self.lastDeg < 0)
			//		self.num++;
			//}
			//if(self.dir == 'left' && !self.atBoundary()){
			//	if(self.lastDeg < 0)
			///		self.num+=2;
			//	else if(self.lastDeg = 0)
			//		self.num++;
		//	}
		}
		
		if(self.landed && !self.atBoundary()){
			self.landed = false;
			if(self.dir == 'left')
				self.deg = self.deg % 90 + (90-(self.deg%90));
			else{
				self.deg = 0;
				self.dir = 'left';
			}
		//	if(self.x != self.launchX)
		//		self.nameOffset -= 1/18;
		}else if(self.landed){
			self.dir = 'left';
			self.landed = false;
		}
			
		
		if(self.launching && !self.atBoundary()){
			if(self.dir == 'right' && self.deg % 10 == 0){
				self.num -= ((self.offset + self.width * 2 / 9) / 2)/(self.width * 2);
			}else if(self.dir == 'left' && self.deg % 10 == 0){
				self.num += ((self.offset + self.width * 2 / 9) / 2)/(self.width * 2);
			}
		}
		
		if(self.prevDir == ''){
			if(self.dir == 'left')
				self.num = 0;
			else
				self.num = -1;
		}
		
		if((self.x + self.width*2) >= upperBound && self.pressingLeft)
			self.num+=1/9;
		
		if(self.deg % 90 == 0 && Math.abs(self.lastDeg) == (Math.abs(self.deg) - 10) && self.launching != true){
			if(self.deg >= 0 && self.dir == 'left')
				self.num += 1;
			else if(self.deg <= 0 && self.dir == 'right')
				self.num -= 1;
		}
		if(self.deg % 90 == 0 && Math.abs(self.lastDeg) == (Math.abs(self.deg) + 10) && self.launching != true){
			if(self.deg <= 0 && self.dir == 'left' && (self.x + self.width*2) <= upperBound)
				self.num++;
			else if(self.deg >= 0 && self.dir == 'right' && self.x >= lowerBound) //here
				self.num--;
		}
			
		if(self.deg > 360)
			self.deg = 10;
		else if(self.deg < -360)
			self.deg = -10;

		if(self.width > self.maxWidth)
			self.width = self.maxWidth;

		for(var i in Player.list){
			var p = Player.list[i];
			if(p.gameOver != true && self.id !== p.id && self.spdY > 0 && self.collided(self, p)){
				var attacker = Player.list[self.id];
				if(attacker){
					attacker.score += p.width;
					self.vel = 0.0315*self.width + 9.24;
					self.velY = self.vel * Math.sin(self.angle*(Math.PI/180));
					self.launch();
					p.gameOver = true;
					users.splice(p.id, 1);
					SOCKET_LIST[p.id].emit('gameOver');
					SOCKET_LIST[attacker.id].emit('resize');
				}
			}
		}
		for(var i in Mass.list){
			var b = Mass.list[i];
			if(self.eatFood(b,self) && self.spdY > 0){
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
		groundY = self.ground - self.width;
		return groundY;
	}
	
	self.getCollisionDist = function(p){
	//	var dist = 139/238 * (self.width + p.width) + 3900/119;
	//	var dist = Math.sqrt(Math.pow(p.width*p.scale,2)+Math.pow(self.width*self.scale,2),2);
		//var dist = p.width/2*self.scale + self.width/2*self.scale; //works
		//var dist = p.width/2 + self.width/2; //works
		var dist = p.width + self.width;
		//var dist = (p.width * Math.sqrt(2,2))/2 + (self.width * Math.sqrt(2,2))/2;
		//var dist = self.width*Math.sqrt(2,2);
		return dist;
	}
	
	self.createMass = function(){
		if(massNum < 100){
			massNum++;
			Mass({
				parent:self.id,
				x:Math.random() * upperBound,
				y:self.ground - 8,
			});
		}
	}
	self.updateSpd = function(){
		self.lastDeg = self.deg;
		
		if(self.pressingLeft && !self.pressingRight || (self.isNotFinishedRotating() && self.lastDir == 'left' && self.launching == false) && !self.atBoundary()){
			if(self.spdX == 0 || self.lastDir == 'right')
				self.num-=1/9;
			self.spdX = self.maxSpd;
			self.deg += 10;
			self.deltaDeg = 10;
			self.lastDir = 'left';
			self.velX = self.vel * Math.cos(self.angle*(Math.PI/180));
		}if(self.pressingRight || (self.isNotFinishedRotating() && self.lastDir == 'right' && self.launching == false) && !self.atBoundary()){
			self.spdX = -self.maxSpd;
			self.deg -= 10;
			self.deltaDeg = -10;
			self.lastDir = 'right';
			self.velX = -self.vel * Math.cos(self.angle*(Math.PI/180));
		}else if(self.isOnGround(self) && !(self.pressingLeft || (self.isNotFinishedRotating() && self.lastDir == 'left' && self.launching == false))){
			self.spdX = 0; 
			self.velX = 0;
		}
		
		if(self.atBoundary()){
			self.spX = 0;
			self.velX = 0;
			if(self.launching != true)
				self.deg = 0;
		}

		if(self.y < self.getGroundY() && self.launching != true)
			self.y = self.getGroundY();
	
		if(self.gameOver){
			self.spdX = 0; 
			self.deg = 0;
			self.velX = 0;		
			self.num = 0;
			self.nameOffset = 0;
		}
		
		if(self.pressingSpace || (self.launching && self.isOnGround(self) != true)){
			if(self.launching != true){
				if(self.pressingLeft && self.lastDeg <= 0){
					self.num++;
					if(self.lastDeg < 0)
						self.num++;
					if(self.prevDir == 'left')
						self.num--;
				}else if(self.pressingRight && self.lastDeg < 0)
					self.num++;
				else if(self.pressingRight && self.lastDeg >= 0){
					self.num--;
					if(self.lastDeg == 0 && self.prevDir == 'right')
						self.num+=2;
				}
				self.launched = true;
				self.rem = (self.deg % 90)/10;
				self.num += self.rem/9;
				self.oldX = self.x;
				if(self.pressingLeft != true && self.pressingRight != true){
					self.dir = 'none';
					self.velX = 0;
					if(self.lastDir == 'right')
						self.num++;
				}else if(self.dir == 'left' && (self.x + self.width*2) < upperBound)
					self.num+=1/9;
				else if(self.dir == 'right' && self.x > lowerBound)
					self.num-=1/9;
				
				if(self.dir == 'left' && self.lastDeg == 0 && self.lastDir == 'right' && !self.atBoundary())
					self.num++;
				if(self.x <= lowerBound)
					self.num++;
			}
			self.launch();
		}
		
		if(self.y > self.getGroundY()){
			self.landed = true;
			self.y = self.getGroundY();
			self.spdY = 0;
			self.spdX = 0;
			self.velY = self.vel * Math.sin(self.angle*(Math.PI/180));			
		}
		
		if(((self.x + self.width*2) > upperBound && (self.spdX > 0 || self.pressingSpace)) || (self.x < lowerBound && (self.spdX < 0 || self.pressingSpace))){
			self.spdX = 0;
			self.x = self.oldX;
		}
	}
	
	self.updateScale = function(){
		self.width = 0.03904 * self.score + 24; 
		self.height = self.width;
		self.scale = self.width * -0.0005123+ 1.0122952;
		
	}
	
	self.launch = function(){
		if(!self.gameOver){
			self.spdX = self.velX;
			self.spdY = -self.velY;
			self.velY += -self.accY;
			if(self.pressingSpace && self.y > self.maxY && self.velY > 0)
				self.velY++;
			self.deg += self.deltaDeg;
			self.launching = true;
		}
	}
	
	self.atBoundary = function(){
		var highX = self.x + self.width*2;
		var lowX = self.x; 
		if(highX >= upperBound || lowX <= lowerBound)
			return true;
		return false;
	}
	
	self.isOnGround = function(p){
		if((p.y+p.width) == self.ground || (p.launching == false && p.spdX != 0)){
			p.launching = false;
			return true;
		}else
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
			deg:self.deg,
			launched:self.launched,
			reversed:self.reversed,
			pressingRight:self.pressingRight,
			pressingLeft:self.pressingLeft,
			pressingSpace:self.pressingSpace,
			launching:self.launching,
			lastDeg:self.lastDeg,
			num:self.num,
			offsetX:self.offsetX,
			dir:self.dir,
			lastDir:self.lastDir,
			landed:self.landed,
			nameOffset:self.nameOffset,
			color:self.color,
			gameOver:self.gameOver,
			width:self.width,
			height:self.height,
			offset:self.offset,
			score:self.score,
		};		
	}
	self.getUpdatePack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,
			deg:self.deg,
			nameOffset:self.nameOffset,
			offset:self.offset,
			offsetX:self.offsetX,
			landed:self.landed,
			launching:self.launching,
			launched:self.launched,
			pressingSpace:self.pressingSpace,
			lastDeg:self.lastDeg,
			pressingRight:self.pressingRight,
			lastDir:self.lastDir,
			pressingLeft:self.pressingLeft,
			num:self.num,
			dir:self.dir,
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
	users.push(player);
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
	delete leaderboard[socket.id];
    users.splice(socket.id, 1);
	removePack.player.push(socket.id);
}
Player.update = function(){
	var pack = [];
	var leaderboardChanged = true;
	
	for(var i in Player.list){
		var player = Player.list[i];
		player.update();
		if (leaderboardChanged) {
            SOCKET_LIST[player.id].emit('leaderboard', {
                players: users.length,
                leaderboard: leaderboard
            });
        }
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
    if (users.length > 0) {
        users.sort( function(a, b) { return b.score - a.score; });

        var topPlayers = [];

        for (var i = 0; i < Math.min(10, users.length); i++) {
            topPlayers.push({
                id: users[i].id,
                username: users[i].username
            });
        }
        if (isNaN(leaderboard) || leaderboard.length !== topPlayers.length) {
            leaderboard = topPlayers;
            leaderboardChanged = true;
        }
        else {
            for (i = 0; i < leaderboard.length; i++) {
                if (leaderboard[i].id !== topPlayers[i].id) {
                    leaderboard = topPlayers;
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
	
	gameloop();
	
},1000/25);

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







