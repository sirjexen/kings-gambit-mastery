/* King's Gambit Mastery v3 — custom tap-to-move board, mobile-first */
(function(){
'use strict';

/* ---------- helpers ---------- */
function $(s){return document.querySelector(s);}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function buzz(ms){try{if(navigator.vibrate)navigator.vibrate(ms);}catch(e){}}

/* ---------- health check ---------- */
var health=$('#health');
if(typeof Chess==='undefined'||typeof LINES==='undefined'||typeof createEngine==='undefined'){
  var missing=[];
  if(typeof Chess==='undefined')missing.push('chess.js');
  if(typeof LINES==='undefined')missing.push('data.js');
  if(typeof createEngine==='undefined')missing.push('engine.js');
  health.classList.remove('hidden');
  health.textContent='Gagal memuat: '+missing.join(', ')+'. Periksa koneksi internet lalu muat ulang halaman.';
  return;
}

/* ---------- state ---------- */
var S={mode:'belajar',gen:0};
var game=new Chess();
var PIECE_CDN='https://chessboardjs.com/img/chesspieces/wikipedia/';
function pieceURL(code){return PIECE_CDN+code+'.png';}

/* ---------- engine service (worker + fallback) ---------- */
var Engine={
  worker:null,seq:0,pending:{},local:null,
  init:function(){
    try{this.local=createEngine(Chess);}catch(e){this.local=null;}
    try{
      var code="importScripts('https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js','engine.js');\n"+
        "var ENG=createEngine(Chess);\n"+
        "onmessage=function(e){var d=e.data;try{var r=ENG.analyze(d.fen,{depth:d.depth,timeMs:d.timeMs});"+
        "postMessage({id:d.id,ok:true,r:r});}catch(err){postMessage({id:d.id,ok:false,error:String((err&&err.message)||err)});}};";
      var w=new Worker(URL.createObjectURL(new Blob([code],{type:'text/javascript'})));
      var self=this;
      w.onmessage=function(e){var d=e.data,p=self.pending[d.id];if(p){delete self.pending[d.id];p(d);}};
      w.onerror=function(){self.worker=null;};
      this.worker=w;
    }catch(e){this.worker=null;}
  },
  analyze:function(fen,depth,timeMs){
    var self=this;
    return new Promise(function(res){
      function fallback(){
        if(self.local){try{res({id:0,ok:true,r:self.local.analyze(fen,{depth:depth,timeMs:timeMs})});return;}catch(e){}}
        res({id:0,ok:false,error:'engine-gagal'});
      }
      if(self.worker){
        var id=++self.seq;self.pending[id]=res;
        try{self.worker.postMessage({id:id,fen:fen,depth:depth,timeMs:timeMs});}
        catch(e){delete self.pending[id];fallback();return;}
        setTimeout(function(){var p=self.pending[id];if(p){delete self.pending[id];fallback();}},timeMs+5000);
      }else fallback();
    });
  }
};

/* ---------- sound ---------- */
var Sfx={on:true,ctx:null,
  init:function(){try{this.on=localStorage.getItem('kgm_sfx')!=='off';}catch(e){this.on=true;}},
  play:function(captured){
    if(!this.on)return;
    try{
      var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      this.ctx=this.ctx||new AC();
      if(this.ctx.state==='suspended')this.ctx.resume();
      var o=this.ctx.createOscillator(),g=this.ctx.createGain();
      o.connect(g);g.connect(this.ctx.destination);
      o.type='sine';o.frequency.value=captured?200:460;
      g.gain.setValueAtTime(0.07,this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+0.12);
      o.start();o.stop(this.ctx.currentTime+0.13);
    }catch(e){}
  },
  toggle:function(){
    this.on=!this.on;
    try{localStorage.setItem('kgm_sfx',this.on?'on':'off');}catch(e){}
    return this.on;
  }
};
function moveFeedback(captured){Sfx.play(captured);buzz(captured?30:12);}
function coach(sel,html){$(sel).innerHTML=html;}

/* ---------- book index ---------- */
var Book={byFen:{}};
LINES.forEach(function(L){
  var g=new Chess();
  L.moves.forEach(function(san,i){
    var fen=g.fen();
    var mv=g.move(san);
    if(!mv)return;
    (Book.byFen[fen]=Book.byFen[fen]||[]).push({line:L.id,san:mv.san,from:mv.from,to:mv.to,tag:L.tags[i]||'',ply:i});
  });
});
function lineById(id){for(var i=0;i<LINES.length;i++)if(LINES[i].id===id)return LINES[i];return null;}

var DEFENSES=[
  {id:'kg-g5',     label:'Terima — Klasik: 2...exf4 lalu 3...g5'},
  {id:'kg-fischer',label:'Terima — Fischer: 3...d6'},
  {id:'kg-cunning',label:'Terima — Cunningham: 3...Be7'},
  {id:'kg-d5',     label:'Terima — Modern: 3...d5'},
  {id:'kg-berlin', label:'Terima — Berlin: 3...Nf6'},
  {id:'kgd-class', label:'Tolak — Klasik: 2...Bc5'},
  {id:'kgd-falk',  label:'Tolak — Falkbeer: 2...d5'}
];

/* ---------- custom board: tap-to-move ---------- */
var Board={
  el:null,orientation:'w',sel:null,targets:{},last:null,marks:{},promo:null,
  init:function(){this.el=$('#board');this.draw();},
  setOrientation:function(o){this.orientation=o;this.draw();},
  flip:function(){this.orientation=(this.orientation==='w'?'b':'w');this.draw();},
  fenMap:function(){
    var map={},rows=game.fen().split(' ')[0].split('/'),files='abcdefgh';
    for(var r=0;r<8;r++){var f=0;
      for(var k=0;k<rows[r].length;k++){var c=rows[r][k];
        if(/\d/.test(c))f+=parseInt(c,10);
        else{map[files[f]+(8-r)]=(c===c.toUpperCase()?'w':'b')+c.toUpperCase();f++;}
      }}
    return map;
  },
  order:function(){
    var files='abcdefgh',out=[];
    for(var r=0;r<8;r++)for(var f=0;f<8;f++)
      out.push(this.orientation==='w'?files[f]+(8-r):files[7-f]+(r+1));
    return out;
  },
  draw:function(){
    if(!this.el)return;
    var self=this,map=this.fenMap(),files='abcdefgh';
    this.el.innerHTML='';
    this.order().forEach(function(sq){
      var f=files.indexOf(sq[0]),r=+sq[1];
      var d=document.createElement('div');
      d.className='sq '+(((f+r)%2===1)?'dark':'light');
      d.setAttribute('data-sq',sq);
      var showRank=(self.orientation==='w'?f===0:f===7);
      var showFile=(self.orientation==='w'?r===1:r===8);
      if(showRank){var cr=document.createElement('span');cr.className='coord rank';cr.textContent=sq[1];d.appendChild(cr);}
      if(showFile){var cf=document.createElement('span');cf.className='coord file';cf.textContent=sq[0];d.appendChild(cf);}
      if(map[sq]){var img=document.createElement('img');img.src=pieceURL(map[sq]);img.alt=map[sq];img.draggable=false;d.appendChild(img);}
      if(self.sel===sq)d.classList.add('sel');
      if(self.last&&(self.last.from===sq||self.last.to===sq))d.classList.add('last');
      if(self.marks[sq])d.classList.add(self.marks[sq]);
      if(self.targets[sq]){var t=document.createElement('span');t.className=map[sq]?'ring':'dot';d.appendChild(t);}
      d.addEventListener('click',function(){onTap(sq);});
      self.el.appendChild(d);
    });
  },
  sync:function(){this.draw();},
  clearSel:function(){this.sel=null;this.targets={};this.draw();},
  clearAll:function(){this.sel=null;this.targets={};this.last=null;this.marks={};this.draw();},
  setLast:function(m){this.last=m;},
  mark:function(sq,cls){this.marks[sq]=cls||'sel';this.draw();},
  clearMarks:function(){this.marks={};this.draw();}
};

function select(sq){
  Board.sel=sq;Board.targets={};Board.marks={};
  game.moves({square:sq,verbose:true}).forEach(function(m){Board.targets[m.to]=m;});
  Board.draw();
}
function showPromo(color){
  var row=$('#promoRow');row.innerHTML='';
  ['q','r','b','n'].forEach(function(p){
    var b=document.createElement('button');
    var img=document.createElement('img');
    img.src=pieceURL(color+p.toUpperCase());img.alt=p;
    b.appendChild(img);
    b.addEventListener('click',function(){
      $('#promo').classList.add('hidden');
      var pr=Board.promo;Board.promo=null;
      if(pr)routeUserMove(pr.from,pr.to,p);
    });
    row.appendChild(b);
  });
  $('#promo').classList.remove('hidden');
}
function onTap(sq){
  if(Board.promo)return;
  if(S.mode==='kuis')return;
  if(Board.sel){
    if(sq===Board.sel){Board.clearSel();return;}
    if(Board.targets[sq]){
      var from=Board.sel;
      var isPromo=game.moves({square:from,verbose:true}).some(function(m){return m.to===sq&&m.promotion;});
      Board.clearSel();
      if(isPromo){Board.promo={from:from,to:sq};showPromo(game.turn());}
      else routeUserMove(from,sq);
      return;
    }
  }
  var piece=game.get(sq);
  if(piece&&piece.color===game.turn())select(sq);
  else Board.clearSel();
}
function routeUserMove(src,tgt,promo){
  if(S.mode==='belajar')Learn.userMove(src,tgt,promo);
  else if(S.mode==='sparring')Sparring.userMove(src,tgt,promo);
  else if(S.mode==='puzzle')Puzzle.userMove(src,tgt,promo);
}
function applyUserMove(src,tgt,promo){
  var mv=game.move({from:src,to:tgt,promotion:promo||'q'});
  if(!mv)return null;
  moveFeedback(!!mv.captured);
  Board.setLast({from:mv.from,to:mv.to});
  refresh();return mv;
}

/* ---------- refresh + eval ---------- */
var evalTimer=null;
function refresh(){
  Board.sync();
  var t=game.turn()==='w'?'Putih':'Hitam',extra='';
  if(game.in_checkmate())extra=' — MAT!';
  else if(game.in_stalemate())extra=' — remis (stalemate)';
  else if(game.in_draw())extra=' — remis';
  else if(game.in_check())extra=' — skak';
  $('#turnBadge').textContent='Giliran: '+t+extra;
  clearTimeout(evalTimer);
  evalTimer=setTimeout(updateEval,700);
}
function updateEval(){
  $('#evalBadge').textContent='evaluasi: …';
  Engine.analyze(game.fen(),2,500).then(function(d){
    if(!d.ok)return;
    var s=d.r.score,txt;
    if(Math.abs(s)>90000)txt='mat';
    else{
      var w=(game.turn()==='w'?s:-s)/100;
      txt=Math.abs(w)<0.15?'seimbang':(w>0?'+':'')+w.toFixed(1)+' untuk '+(w>0?'Putih':'Hitam');
    }
    $('#evalBadge').textContent='evaluasi: '+txt;
  });
}

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach(function(b){
  b.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active');});
    b.classList.add('active');
    stopAllModes();
    S.mode=b.getAttribute('data-tab');
    Board.promo=null;$('#promo').classList.add('hidden');
    Board.clearAll();
    document.querySelectorAll('.panel').forEach(function(p){p.classList.add('hidden');});
    $('#panel-'+S.mode).classList.remove('hidden');
    if(S.mode==='belajar')Learn.enter();
    else if(S.mode==='sparring')Sparring.enter();
    else if(S.mode==='puzzle')Puzzle.enter();
    else if(S.mode==='kuis')Quiz.enter();
  });
});
function stopAllModes(){S.gen++;Learn.stop();Sparring.stop();}

/* ================= BELAJAR ================= */
var Learn={
  line:LINES[0],ply:0,guess:false,attempts:0,autoTimer:null,
  enter:function(){
    var sel=$('#selLine');sel.innerHTML='';
    LINES.forEach(function(L){var o=document.createElement('option');o.value=L.id;o.textContent=L.name;sel.appendChild(o);});
    sel.value=this.line.id;
    sel.onchange=function(){Learn.line=lineById(sel.value);Learn.reset(false);};
    $('#btnPrev').onclick=function(){Learn.step(-1);};
    $('#btnNext').onclick=function(){Learn.step(1);};
    $('#btnAuto').onclick=function(){Learn.toggleAuto();};
    $('#btnGuess').onclick=function(){Learn.startGuess();};
    this.reset(false);
  },
  stop:function(){if(this.autoTimer){clearInterval(this.autoTimer);this.autoTimer=null;$('#btnAuto').textContent='Otomatis';}},
  reset:function(guess){
    this.stop();this.ply=0;this.guess=!!guess;this.attempts=0;
    this.render();
    coach('#coachLearn',guess?'Mode tebak langkah: ketuk bidak lalu ketuk petak tujuan untuk memainkan langkah teori berikutnya.':'Pilih lini, lalu telusuri langkahnya atau uji ingatanmu dengan "Tebak Langkah".');
  },
  posAt:function(ply){
    var g=new Chess();
    for(var i=0;i<ply&&i<this.line.moves.length;i++)g.move(this.line.moves[i]);
    return g;
  },
  expected:function(){
    if(this.ply>=this.line.moves.length)return null;
    return this.posAt(this.ply).move(this.line.moves[this.ply],{verbose:true});
  },
  render:function(){
    game=this.posAt(this.ply);
    Board.setOrientation('w');Board.clearAll();
    refresh();
    var L=this.line;
    $('#lineMeta').innerHTML='<b>'+esc(L.name)+'</b><br>'+esc(L.sub)+
      '<br>Rencana Putih: '+esc(L.planW)+'<br>Rencana Hitam: '+esc(L.planB);
    var ol=$('#moveList');ol.innerHTML='';
    var g=new Chess(),self=this,cur=null;
    L.moves.forEach(function(san,i){
      var mv=g.move(san);
      var li=document.createElement('li');
      if(i===this.ply-1){li.className='cur';cur=li;}
      li.innerHTML='<b>'+(Math.floor(i/2)+1)+'. '+(i%2===0?'':'…')+esc(mv.san)+'</b><span class="note">'+esc(L.notes[i]||'')+'</span>';
      (function(idx){li.addEventListener('click',function(){self.ply=idx+1;self.guess=false;self.render();});})(i);
      ol.appendChild(li);
    },this);
    if(cur)cur.scrollIntoView({block:'nearest'});
    if(this.guess&&this.ply<this.line.moves.length){
      var e=this.expected();
      coach('#coachLearn','Tebak langkah '+(Math.floor(this.ply/2)+1)+' untuk '+(e.color==='w'?'Putih':'Hitam')+'.');
      if(e)Board.mark(e.from,'sel');
    }
  },
  step:function(d){
    this.guess=false;
    this.ply=Math.max(0,Math.min(this.line.moves.length,this.ply+d));
    this.render();
  },
  toggleAuto:function(){
    if(this.autoTimer){this.stop();return;}
    this.guess=false;
    if(this.ply>=this.line.moves.length)this.ply=0;
    $('#btnAuto').textContent='Berhenti';
    coach('#coachLearn','Autoplay berjalan…');
    var self=this;
    this.autoTimer=setInterval(function(){
      if(self.ply>=self.line.moves.length){self.stop();coach('#coachLearn','Selesai. Ulangi dengan "Tebak Langkah" untuk menguji ingatan.');return;}
      self.ply++;self.render();
    },1400);
    this.render();
  },
  startGuess:function(){this.reset(true);},
  userMove:function(src,tgt,promo){
    if(!this.guess){coach('#coachLearn','Aktifkan "Tebak Langkah" dulu kalau mau menebak.');return;}
    var e=this.expected();
    if(!e){coach('#coachLearn','Lini selesai. Hebat!');return;}
    if(src===e.from&&tgt===e.to){
      applyUserMove(src,tgt,promo);
      this.ply++;this.attempts=0;
      if(this.ply>=this.line.moves.length){
        this.guess=false;this.render();
        coach('#coachLearn','Sempurna! Kamu hafal seluruh lini <b>'+esc(this.line.name)+'</b>.');
      }else{this.render();coach('#coachLearn','Benar! '+esc(this.line.notes[this.ply-1]||''));}
    }else{
      this.attempts++;
      if(this.attempts>=2){
        coach('#coachLearn','Jawabannya: <b>'+esc(e.san)+'</b> — '+esc(this.line.notes[this.ply]||''));
        Board.mark(e.from,'sel');Board.mark(e.to,'sel');
      }else coach('#coachLearn','Belum tepat. Coba lagi!');
    }
  }
};

/* ================= SPARRING ================= */
var Sparring={
  active:false,userColor:'w',defenseId:'kg-g5',level:2,free:false,botThinking:false,movesPlayed:0,
  LEVELS:{1:{depth:1,timeMs:350,blunder:0.22},2:{depth:3,timeMs:800,blunder:0.03},3:{depth:5,timeMs:2000,blunder:0}},
  enter:function(){
    var sd=$('#selDefense');sd.innerHTML='';
    DEFENSES.forEach(function(d){var o=document.createElement('option');o.value=d.id;o.textContent=d.label;sd.appendChild(o);});
    sd.value=this.defenseId;
    $('#btnSparStart').onclick=function(){Sparring.start();};
    $('#btnSparStop').onclick=function(){Sparring.stop();};
    $('#btnPgn').onclick=function(){
      if(navigator.clipboard&&navigator.clipboard.writeText)
        navigator.clipboard.writeText(game.pgn()).then(
          function(){coach('#coachSpar','PGN tersalin. Tempel di mana saja untuk menyimpan partaimu.');},
          function(){coach('#coachSpar','Gagal menyalin PGN.');});
      else coach('#coachSpar','Browser tidak mendukung salin otomatis.');
    };
    this.showIdle();
  },
  stop:function(){this.active=false;},
  showIdle:function(){
    game=new Chess();Board.setOrientation('w');Board.clearAll();refresh();
    $('#sparMoves').innerHTML='';
    coach('#coachSpar','Bot akan memainkan King\'s Gambit sungguhan: 1.e4 selalu dibalas 1…e5, lalu mengikuti buku teori pertahanan pilihanmu.');
  },
  start:function(){
    S.gen++;var myGen=S.gen;
    this.active=true;this.free=false;this.botThinking=false;this.movesPlayed=0;
    this.userColor=$('#selColor').value;
    this.defenseId=$('#selDefense').value;
    this.level=parseInt($('#selLevel').value,10)||2;
    var defLabel=$('#selDefense').selectedOptions[0].textContent;
    $('#sparMoves').innerHTML='';
    Board.clearAll();
    if(this.userColor==='w'){
      game=new Chess();Board.setOrientation('w');
      coach('#coachSpar','Kamu Putih. Mainkan <b>1.e4</b> — bot akan membalas 1…e5 lalu bertahan dengan <b>'+esc(defLabel)+'</b>.');
    }else{
      game=new Chess();
      ['e4','e5','f4'].forEach(function(m){game.move(m);});
      this.movesPlayed=3;
      Board.setOrientation('b');
      coach('#coachSpar','Posisi gambit disiapkan: 1.e4 e5 2.f4. Giliranmu sebagai Hitam — mainkan pertahanan <b>'+esc(defLabel)+'</b> (mis. '+esc(this.bookMoveHint())+').');
    }
    refresh();this.renderMoves();
    this.maybeBotMove(myGen);
  },
  bookMoveHint:function(){
    var L=lineById(this.defenseId);
    return L?L.moves[this.movesPlayed]||'—':'—';
  },
  bookMove:function(){
    var cands=Book.byFen[game.fen()]||[];
    for(var i=0;i<cands.length;i++)
      if(cands[i].line===this.defenseId)return cands[i];
    return null;
  },
  userMove:function(src,tgt,promo){
    if(!this.active){coach('#coachSpar','Tekan "Mulai Sparring" dulu.');return;}
    if(game.turn()!==this.userColor){coach('#coachSpar','Bukan giliranmu.');return;}
    var mv=applyUserMove(src,tgt,promo);
    if(!mv)return;
    this.movesPlayed++;this.renderMoves();
    if(this.checkOver())return;
    var myGen=S.gen;
    if(this.userColor==='w'&&this.movesPlayed===1){
      if(game.history()[0]!=='e4'){
        this.free=true;
        coach('#coachSpar','Kamu membuka dengan '+esc(game.history()[0]||'?')+' — bukan 1.e4, jadi King\'s Gambit batal. Lanjut main bebas ya.');
        this.maybeBotMove(myGen);return;
      }
      if(game.turn()===this.botColor()){
        var e2=game.move('e5');
        if(e2){this.movesPlayed++;moveFeedback(false);Board.setLast({from:e2.from,to:e2.to});refresh();this.renderMoves();
          coach('#coachSpar','1…e5 dimainkan. Sekarang <b>2.f4!</b> — ayo gambitnya.');}
      }
      return;
    }
    if(this.userColor==='w'&&this.movesPlayed===3){
      if(game.history()[2]!=='f4'){
        this.free=true;
        coach('#coachSpar','Kamu tidak memainkan 2.f4 — jadi ini bukan King\'s Gambit. Lanjut main bebas melawan bot ya.');
      }else{
        coach('#coachSpar','2.f4! Gambit di papan. Bot bertahan dengan <b>'+esc($('#selDefense').selectedOptions[0].textContent)+'</b>.');
      }
    }
    if(this.userColor==='b'&&!this.free){
      var L=lineById(this.defenseId),g=new Chess(),ok=true,h=game.history();
      for(var i=0;i<h.length&&i<L.moves.length;i++){
        if(h[i]!==g.move(L.moves[i]).san){ok=false;break;}
      }
      if(!ok){this.free=true;coach('#coachSpar','Kamu keluar dari jalur buku — lanjut main bebas.');}
    }
    this.maybeBotMove(myGen);
  },
  botColor:function(){return this.userColor==='w'?'b':'w';},
  maybeBotMove:function(myGen){
    var self=this;
    if(!self.active||self.botThinking)return;
    if(game.game_over())return;
    if(game.turn()!==self.botColor())return;
    self.botThinking=true;
    coach('#coachSpar','Bot berpikir…');
    setTimeout(function(){self.doBotMove(myGen);},450);
  },
  doBotMove:function(myGen){
    var self=this;
    self.botThinking=false;
    if(!self.active||myGen!==S.gen||S.mode!=='sparring')return;
    if(game.turn()!==self.botColor())return;
    var L=self.LEVELS[self.level];
    var choice=null,viaBook=false;
    if(!self.free){
      var b=self.bookMove();
      if(b){choice={from:b.from,to:b.to,promotion:'q'};viaBook=true;}
    }
    var done=function(ch){
      if(!ch)return;
      var mv=game.move({from:ch.from,to:ch.to,promotion:ch.promotion||'q'});
      if(!mv)return;
      moveFeedback(!!mv.captured);
      self.movesPlayed++;Board.setLast({from:mv.from,to:mv.to});
      refresh();self.renderMoves();
      if(self.checkOver())return;
      coach('#coachSpar',viaBook?('Bot (buku teori): <b>'+esc(mv.san)+'</b>. Giliranmu.'):'Giliranmu.');
    };
    if(choice){done(choice);return;}
    if(Math.random()<L.blunder){
      var all=game.moves({verbose:true});
      var pick=all[Math.floor(Math.random()*all.length)];
      done({from:pick.from,to:pick.to,promotion:pick.promotion});return;
    }
    Engine.analyze(game.fen(),L.depth,L.timeMs).then(function(d){
      if(!self.active||myGen!==S.gen||S.mode!=='sparring')return;
      if(d.ok&&d.r&&d.r.best)done(d.r.best);
      else{
        var all2=game.moves({verbose:true});
        if(all2.length){var p2=all2[0];done({from:p2.from,to:p2.to,promotion:p2.promotion});}
      }
    });
  },
  renderMoves:function(){
    var h=game.history(),html='';
    for(var i=0;i<h.length;i+=2)
      html+='<li>'+(i/2+1)+'. '+esc(h[i])+(h[i+1]?' '+esc(h[i+1]):'')+'</li>';
    $('#sparMoves').innerHTML=html;
  },
  checkOver:function(){
    if(!game.game_over())return false;
    var msg;
    if(game.in_checkmate())msg=game.turn()!==this.userColor?'Kamu menang — MAT!':'Bot menang — mat. Coba lagi!';
    else if(game.in_stalemate())msg='Remis — stalemate.';
    else if(game.in_threefold_repetition())msg='Remis — repetisi.';
    else if(game.in_insufficient_material())msg='Remis — materi kurang.';
    else msg='Remis.';
    this.active=false;
    coach('#coachSpar','<b>Partai selesai:</b> '+msg);
    return true;
  }
};

/* ================= PUZZLE ================= */
var Puzzle={
  idx:0,step:0,solved:0,streak:0,
  enter:function(){
    $('#btnPuzPrev').onclick=function(){Puzzle.go(Puzzle.idx-1);};
    $('#btnPuzNext').onclick=function(){Puzzle.go(Puzzle.idx+1);};
    $('#btnPuzReset').onclick=function(){Puzzle.load();};
    $('#btnPuzSkip').onclick=function(){Puzzle.go(Puzzle.idx+1);};
    this.go(0);
  },
  go:function(i){
    this.idx=(i+PUZZLES.length)%PUZZLES.length;
    this.load();
  },
  load:function(){
    var pz=PUZZLES[this.idx];
    this.step=0;
    game=new Chess(pz.fen);
    Board.setOrientation(pz.side);Board.clearAll();refresh();
    $('#puzTitle').textContent='Puzzle '+(this.idx+1)+'/'+PUZZLES.length+': '+pz.title+' ('+(pz.side==='w'?'Putih':'Hitam')+' melangkah)';
    this.score();
    coach('#coachPuz','Temukan langkah terbaik'+(pz.solution.length>1?' ('+pz.solution.length+' langkah)':'')+'.');
  },
  score:function(){$('#puzScore').textContent='Benar: '+this.solved+' · Streak: '+this.streak;},
  expected:function(){
    var pz=PUZZLES[this.idx];
    if(this.step>=pz.solution.length)return null;
    return new Chess(game.fen()).move(pz.solution[this.step],{verbose:true});
  },
  userMove:function(src,tgt,promo){
    var e=this.expected();
    if(!e)return;
    if(src===e.from&&tgt===e.to){
      applyUserMove(src,tgt,promo);
      this.step++;
      var pz=PUZZLES[this.idx],self=this;
      if(this.step>=pz.solution.length){
        this.solved++;this.streak++;this.score();
        coach('#coachPuz','Tepat sekali! Lanjut ke puzzle berikutnya…');
        setTimeout(function(){if(S.mode==='puzzle')self.go(self.idx+1);},1400);
      }else{
        var reply=this.expected();
        if(reply){
          setTimeout(function(){
            if(S.mode!=='puzzle')return;
            var r=game.move({from:reply.from,to:reply.to,promotion:'q'});
            if(r){self.step++;moveFeedback(!!r.captured);Board.setLast({from:r.from,to:r.to});refresh();
              if(self.step>=PUZZLES[self.idx].solution.length){
                self.solved++;self.streak++;self.score();
                coach('#coachPuz','Tepat sekali! Lanjut…');
                setTimeout(function(){if(S.mode==='puzzle')self.go(self.idx+1);},1400);
              }else coach('#coachPuz','Bagus — lanjutkan!');
            }
          },600);
        }else coach('#coachPuz','Bagus — lanjutkan!');
      }
    }else{
      this.streak=0;this.score();
      coach('#coachPuz','Kurang tepat. Posisi dikembalikan — coba lagi.');
      game=new Chess(PUZZLES[this.idx].fen);this.step=0;Board.clearAll();refresh();
    }
  }
};

/* ================= KUIS ================= */
var Quiz={
  scoreN:0,answered:true,
  enter:function(){
    var self=this;
    $('#btnQuizNew').onclick=function(){self.newQ();};
    $('#quizScore').textContent='Benar: 0';
    $('#quizQ').textContent='Tekan "Soal baru" untuk mulai.';
    $('#quizOpts').innerHTML='';$('#quizFb').innerHTML='';
  },
  trapQs:function(){
    var out=[];
    LINES.forEach(function(L){
      var g=new Chess();
      L.moves.forEach(function(san,i){
        var fen=g.fen(),tag=L.tags[i]||'';
        var mv=g.move(san,{verbose:true});
        if(/Jebakan/.test(tag)&&mv){
          var legal=new Chess(fen).moves({verbose:true})
            .filter(function(m){return !(m.from===mv.from&&m.to===mv.to);});
          if(legal.length>=2)out.push({fen:fen,move:mv,legal:legal,line:L,ply:i});
        }
      });
    });
    return out;
  },
  newQ:function(){
    this.answered=false;
    $('#quizFb').innerHTML='';
    var traps=this.trapQs();
    if(traps.length&&Math.random()<0.45)this.trapQ(traps[Math.floor(Math.random()*traps.length)]);
    else this.theoryQ();
    $('#quizScore').textContent='Benar: '+this.scoreN;
  },
  setBoard:function(fen){
    game=new Chess(fen);
    Board.setOrientation(game.turn());Board.clearAll();refresh();
  },
  renderOpts:function(opts,explain){
    var box=$('#quizOpts');box.innerHTML='';var self=this;
    opts.forEach(function(o){
      var b=document.createElement('button');b.className='btn';
      b.innerHTML='<b>'+esc(o.san)+'</b>'+(o.tag?' <span class="meta">'+esc(o.tag)+'</span>':'');
      b.onclick=function(){
        if(self.answered)return;self.answered=true;
        box.querySelectorAll('button').forEach(function(x){x.disabled=true;});
        if(o.ok){b.classList.add('ok');self.scoreN++;$('#quizScore').textContent='Benar: '+self.scoreN;coach('#quizFb','Benar! '+explain);}
        else{b.classList.add('no');coach('#quizFb','Kurang tepat. '+explain);}
      };
      box.appendChild(b);
    });
  },
  theoryQ:function(){
    var L=LINES[Math.floor(Math.random()*LINES.length)];
    var maxPly=Math.min(5,L.moves.length-1);
    var ply=Math.floor(Math.random()*(maxPly+1));
    var g=new Chess();
    for(var i=0;i<ply;i++)g.move(L.moves[i]);
    this.setBoard(g.fen());
    var correct=new Chess(g.fen()).move(L.moves[ply],{verbose:true});
    if(!correct){this.newQ();return;}
    var others=g.moves({verbose:true}).filter(function(m){return !(m.from===correct.from&&m.to===correct.to);});
    for(var k=others.length-1;k>0;k--){var j=Math.floor(Math.random()*(k+1));var t=others[k];others[k]=others[j];others[j]=t;}
    var opts=[{san:correct.san,ok:true}];
    others.slice(0,2).forEach(function(m){opts.push({san:m.san,ok:false});});
    for(var k2=opts.length-1;k2>0;k2--){var j2=Math.floor(Math.random()*(k2+1));var t2=opts[k2];opts[k2]=opts[j2];opts[j2]=t2;}
    $('#quizQ').innerHTML='Setelah '+ply+' langkah pada <b>'+esc(L.name)+'</b> — apa langkah teori untuk '+(correct.color==='w'?'Putih':'Hitam')+'?';
    this.renderOpts(opts,'Jawabannya: <b>'+esc(correct.san)+'</b>.'+((L.notes&&L.notes[ply])?' '+esc(L.notes[ply]):''));
  },
  trapQ:function(t){
    this.setBoard(t.fen);
    var g=new Chess(t.fen);
    var legal=t.legal.slice();
    for(var k=legal.length-1;k>0;k--){var j=Math.floor(Math.random()*(k+1));var tmp=legal[k];legal[k]=legal[j];legal[j]=tmp;}
    var opts=[{san:t.move.san,ok:true,tag:'Jebakan'}];
    legal.slice(0,2).forEach(function(m){opts.push({san:m.san,ok:false});});
    for(var k2=opts.length-1;k2>0;k2--){var j2=Math.floor(Math.random()*(k2+1));var t2=opts[k2];opts[k2]=opts[j2];opts[j2]=t2;}
    $('#quizQ').innerHTML='Pada <b>'+esc(t.line.name)+'</b> — giliran '+(g.turn()==='w'?'Putih':'Hitam')+'. <b>Manakah jebakan khas di posisi ini?</b>';
    this.renderOpts(opts,'Jebakannya: <b>'+esc(t.move.san)+'</b>.'+((t.line.notes&&t.line.notes[t.ply])?' '+esc(t.line.notes[t.ply]):''));
  }
};

/* ---------- init ---------- */
Engine.init();
Sfx.init();
Board.init();
$('#btnFlip').addEventListener('click',function(){Board.flip();});
var sfxBtn=$('#btnSfx');
sfxBtn.textContent='Suara: '+(Sfx.on?'on':'off');
sfxBtn.addEventListener('click',function(){sfxBtn.textContent='Suara: '+(Sfx.toggle()?'on':'off');});
Learn.enter();
refresh();

/* hook untuk automated test */
if(typeof window!=='undefined')window.__kgm={Learn:Learn,Sparring:Sparring,Puzzle:Puzzle,Quiz:Quiz,Book:Book,DEFENSES:DEFENSES,S:S,Board:Board,tap:onTap,
  getGame:function(){return game;},setGame:function(g){game=g;}};
})();
