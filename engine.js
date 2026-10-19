function createEngine(ChessCtor){
  var INF=99999999, MATE=100000, TT_CAP=40000;
  var T_P=[0,0,0,0,0,0,0,0,5,10,10,-20,-20,10,10,5,5,-5,-10,0,0,-10,-5,5,0,0,0,20,20,0,0,0,5,5,10,25,25,10,5,5,10,10,20,30,30,20,10,10,50,50,50,50,50,50,50,50,0,0,0,0,0,0,0,0];
  var T_N=[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,5,5,0,-20,-40,-30,5,10,15,15,10,5,-30,-30,0,15,20,20,15,0,-30,-30,5,15,20,20,15,5,-30,-30,0,10,15,15,10,0,-30,-40,-20,0,0,0,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50];
  var T_B=[-20,-10,-10,-10,-10,-10,-10,-20,-10,5,0,0,0,0,5,-10,-10,10,10,10,10,10,10,-10,-10,0,10,10,10,10,0,-10,-10,5,5,10,10,5,5,-10,-10,0,5,10,10,5,0,-10,-10,0,0,0,0,0,0,-10,-20,-10,-10,-10,-10,-10,-10,-20];
  var T_R=[0,0,0,5,5,0,0,0,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,5,10,10,10,10,10,10,5,0,0,0,0,0,0,0,0];
  var T_Q=[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,5,0,0,0,0,-10,-10,5,5,5,5,5,0,-10,0,0,5,5,5,5,0,-5,-5,0,5,5,5,5,0,-5,-10,0,5,5,5,5,0,-10,-10,0,0,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20];
  var T_KM=[20,30,10,0,0,10,30,20,20,20,0,0,0,0,20,20,-10,-20,-20,-20,-20,-20,-20,-10,-20,-30,-30,-40,-40,-30,-30,-20,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30];
  var T_KE=[-50,-30,-30,-30,-30,-30,-30,-50,-30,-30,0,0,0,0,-30,-30,-30,-10,20,30,30,20,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,20,30,30,20,-10,-30,-30,-20,-10,0,0,-10,-20,-30,-50,-40,-30,-20,-20,-30,-40,-50];
  var PST={p:T_P,n:T_N,b:T_B,r:T_R,q:T_Q,k:T_KM};
  var VAL={p:100,n:320,b:330,r:500,q:900,k:0};
  var PHV={p:0,n:1,b:1,r:2,q:4,k:0};
  var B_ATK_F7=['e6','d5','c4','b3','a2','g6','h5','g8','e8'];
  var N_ATK_F7=['d8','e5','g5','h8','h6','d6'];
  var B_ATK_F2=['e1','d3','c3','b4','a5','g1','h2','g3','e3'];
  var N_ATK_F2=['d1','e3','g3','h4','h2','d3'];
  var TT={}, TT_SIZE=0, killers={}, hist={}, nodes=0, timedOut=false;
  function sqi(sq){var f=sq.charCodeAt(0)-97,r=sq.charCodeAt(1)-49;return r*8+f;}
  function mir(i){var r=i>>3,f=i&7;return (7-r)*8+f;}
  function ttGet(k){return TT[k];}
  function ttSet(k,v){if(TT_SIZE>=TT_CAP){TT={};TT_SIZE=0;}if(!TT[k])TT_SIZE++;TT[k]=v;}
  function evaluate(g,fast){
    var mg=0,eg=0,ph=0,bd=g.board(),r,f,pc,i,mi,sgn,v;
    var wB=0,bB=0;
    for(r=0;r<8;r++)for(f=0;f<8;f++){pc=bd[r][f];if(!pc)continue;
      i=(7-r)*8+f;mi=mir(i);sgn=pc.color==='w'?1:-1;v=VAL[pc.type];ph+=PHV[pc.type];
      var t=PST[pc.type];mg+=sgn*(v+t[pc.color==='w'?i:mi]);
      var te=pc.type==='k'?T_KE:t;eg+=sgn*(v+te[pc.color==='w'?i:mi]);
      if(pc.type==='b'){if(pc.color==='w')wB++;else bB++;}
    }
    var mgW=ph>24?1:ph/24, sc=mg*mgW+eg*(1-mgW);
    if(wB>=2)sc+=30; if(bB>=2)sc-=30;
    var fen=g.fen(),parts=fen.split(' '),castle=parts[2],fullmove=parseInt(parts[5],10)||1;
    for(r=0;r<8;r++)for(f=0;f<8;f++){pc=bd[r][f];if(!pc)continue;
      var sq=String.fromCharCode(97+f)+(8-r), sgn2=pc.color==='w'?1:-1;
      if(pc.type==='n'||pc.type==='b'){
        var home=(pc.color==='w'&&r===7)||(pc.color==='b'&&r===0);
        if(!home)sc+=sgn2*12;
      }
      if(pc.type==='p'){
        if(pc.color==='w'&&(sq==='d4'||sq==='e4'))sc+=14;
        if(pc.color==='b'&&(sq==='d5'||sq==='e5'))sc-=14;
      }
      if(pc.type==='n'){
        if(pc.color==='w'&&(sq==='d4'||sq==='e4'||sq==='d5'||sq==='e5'))sc+=8;
        if(pc.color==='b'&&(sq==='d4'||sq==='e4'||sq==='d5'||sq==='e5'))sc-=8;
      }
      if(pc.type==='r'&&f===5){
        var pawnsOnF=false,ownPawnsOnF=false;
        for(var rr=0;rr<8;rr++){var q=bd[rr][5];if(q&&q.type==='p'){pawnsOnF=true;if(q.color===pc.color)ownPawnsOnF=true;}}
        if(!pawnsOnF)sc+=sgn2*25;else if(!ownPawnsOnF)sc+=sgn2*12;
      }
      if(pc.type==='q'){
        var hsq=pc.color==='w'?'d1':'d8';
        if(sq!==hsq&&fullmove<10){
          var undev=0;
          for(var ff=0;ff<8;ff++){var a=bd[pc.color==='w'?7:0][ff];if(a&&(a.type==='n'||a.type==='b'))undev++;}
          if(undev>=2)sc+=sgn2*-20;
        }
      }
      if(pc.type==='b'&&B_ATK_F7.indexOf(sq)>=0&&pc.color==='w')sc+=10;
      if(pc.type==='n'&&N_ATK_F7.indexOf(sq)>=0&&pc.color==='w')sc+=10;
      if(pc.type==='b'&&B_ATK_F2.indexOf(sq)>=0&&pc.color==='b')sc-=10;
      if(pc.type==='n'&&N_ATK_F2.indexOf(sq)>=0&&pc.color==='b')sc-=10;
    }
    var wKing=g.get('e1'),bKing=g.get('e8');
    if(castle.indexOf('K')<0&&castle.indexOf('Q')<0){var wk=g.get('g1')||g.get('c1');if(!wk||wk.type!=='k')sc-=25;}
    if(castle.indexOf('k')<0&&castle.indexOf('q')<0){var bk=g.get('g8')||g.get('c8');if(!bk||bk.type!=='k')sc+=25;}
    var wf2=g.get('f2'),bf7=g.get('f7');
    if((!wKing||wKing.type!=='k')&&(!wf2||wf2.type!=='p'))sc-=15;
    if((!bKing||bKing.type!=='k')&&(!bf7||bf7.type!=='p'))sc+=15;
    if(!fast){
      var mv=g.moves({verbose:true});
      sc+=(g.turn()==='w'?1:-1)*mv.length*1.5;
      sc+=hangingScore(g);
    }
    return Math.round(sc);
  }
  function pawnAttacks(sq,color){
    var f=sq.charCodeAt(0)-97,r=sq.charCodeAt(1)-49,out=[];
    if(color==='w'){if(r>0){if(f>0)out.push(String.fromCharCode(96+f)+r);if(f<7)out.push(String.fromCharCode(98+f)+r);}}
    else{if(r<7){if(f>0)out.push(String.fromCharCode(96+f)+(r+2));if(f<7)out.push(String.fromCharCode(98+f)+(r+2));}}
    return out;
  }
  function hangingScore(g){
    var s=0,sqs=['a1','b1','c1','d1','e1','f1','g1','h1','a2','b2','c2','d2','e2','f2','g2','h2','a3','b3','c3','d3','e3','f3','g3','h3','a4','b4','c4','d4','e4','f4','g4','h4','a5','b5','c5','d5','e5','f5','g5','h5','a6','b6','c6','d6','e6','f6','g6','h6','a7','b7','c7','d7','e7','f7','g7','h7','a8','b8','c8','d8','e8','f8','g8','h8'];
    for(var i=0;i<sqs.length;i++){var pc=g.get(sqs[i]);if(!pc||pc.type==='p'||pc.type==='k')continue;
      var enemy=pc.color==='w'?'b':'w',atk=pawnAttacks(sqs[i],enemy),hit=false,def=false;
      for(var j=0;j<atk.length;j++){var a=g.get(atk[j]);if(a&&a.type==='p'&&a.color===enemy){hit=true;break;}}
      if(!hit)continue;
      var datk=pawnAttacks(sqs[i],pc.color);
      for(var k=0;k<datk.length;k++){var d=g.get(datk[k]);if(d&&d.type==='p'&&d.color===pc.color){def=true;break;}}
      if(!def){var pen=pc.type==='q'?50:pc.type==='r'?30:20;s+=(pc.color==='w'?-pen:pen);}
    }
    return s;
  }
  function isTactical(m){return m.flags.indexOf('c')>=0||m.flags.indexOf('p')>=0||m.flags.indexOf('e')>=0;}
  function orderMoves(g,moves,ply){
    var i,m,s;
    for(i=0;i<moves.length;i++){m=moves[i];s=0;
      if(m.captured)s+=10*VAL[m.captured]-VAL[m.piece]/10;
      if(m.promotion)s+=VAL[m.promotion];
      if(m.san.indexOf('+')>=0)s+=50;
      var kk=killers[ply];if(kk&&kk.from===m.from&&kk.to===m.to)s+=900;
      var hk=hist[m.from+m.to];if(hk)s+=hk;
      m._s=s;
    }
    moves.sort(function(a,b){return b._s-a._s;});
    return moves;
  }
  function quiesce(g,alpha,beta,qply,stop){
    nodes++;
    if((nodes&1023)===0&&Date.now()>stop){timedOut=true;return 0;}
    if(g.in_checkmate())return -MATE+qply;
    if(g.in_draw()||g.in_stalemate()||g.insufficient_material())return 0;
    var inChk=g.in_check();
    var stand=evaluate(g,qply===0)*(g.turn()==='w'?1:-1);
    if(!inChk){
      if(stand>=beta)return beta;
      if(stand>alpha)alpha=stand;
      if(qply>=10)return alpha;
    }
    var moves=g.moves({verbose:true});
    if(inChk){if(!moves.length)return -MATE+qply;}
    else{moves=moves.filter(isTactical);}
    orderMoves(g,moves,0);
    for(var i=0;i<moves.length;i++){
      g.move(moves[i]);var s=-quiesce(g,-beta,-alpha,qply+1,stop);g.undo();
      if(timedOut)return 0;
      if(s>=beta)return beta;
      if(s>alpha)alpha=s;
    }
    return alpha;
  }
  function negamax(g,depth,alpha,beta,ply,stop){
    nodes++;
    if((nodes&511)===0&&Date.now()>stop){timedOut=true;return 0;}
    if(g.in_checkmate())return -MATE+ply;
    if(g.in_draw()||g.in_stalemate()||g.insufficient_material()||g.in_threefold_repetition())return 0;
    var key=g.fen(),tt=ttGet(key);
    if(tt&&tt.depth>=depth){
      if(tt.flag===0)return tt.score;
      if(tt.flag===1&&tt.score>=beta)return beta;
      if(tt.flag===2&&tt.score<=alpha)return alpha;
    }
    var inChk=g.in_check();
    var d=depth+(inChk&&depth<7?1:0);
    if(d<=0)return quiesce(g,alpha,beta,0,stop);
    var moves=orderMoves(g,g.moves({verbose:true}),ply);
    if(!moves.length)return inChk?-MATE+ply:0;
    var best=-INF,origA=alpha,bestM=null;
    for(var i=0;i<moves.length;i++){
      g.move(moves[i]);
      var s=-negamax(g,d-1,-beta,-alpha,ply+1,stop);
      g.undo();
      if(timedOut)return 0;
      if(s>best){best=s;bestM=moves[i];}
      if(s>alpha)alpha=s;
      if(alpha>=beta)break;
    }
    var flag=best<=origA?2:best>=beta?1:0;
    ttSet(key,{depth:depth,score:best,flag:flag});
    if(bestM){
      var hk=bestM.from+bestM.to;hist[hk]=(hist[hk]||0)+d*d;
      if(!isTactical(bestM))killers[ply]={from:bestM.from,to:bestM.to};
    }
    return best;
  }
  function analyze(fen,opts){
    opts=opts||{};
    var g=new ChessCtor(fen);
    var maxD=opts.depth||4,timeMs=opts.timeMs||800;
    var st=opts.resume||null;
    var scored,depthReached,stop;
    if(st){scored=st.scored;depthReached=st.depthReached;stop=st.stop;g=new ChessCtor(st.fen);}
    else{
      var rm=g.moves({verbose:true});
      if(!rm.length){
        var term=g.in_checkmate()?'checkmate':(g.in_stalemate()?'stalemate':'draw');
        return {done:true,moves:[],best:null,score:0,depth:0,nodes:0,terminal:term};
      }
      scored=rm.map(function(m){return {m:m,s:0};});
      depthReached=0;stop=Date.now()+timeMs;nodes=0;timedOut=false;TT={};TT_SIZE=0;killers={};hist={};
    }
    var startDepth=depthReached+1;
    for(var d=startDepth;d<=maxD;d++){
      var alpha=-INF;
      orderMoves(g,scored.map(function(x){return x.m;}),0);
      scored.sort(function(a,b){return b.s-a.s;});
      for(var i=0;i<scored.length;i++){
        g.move(scored[i].m);
        var s;
        if(g.in_checkmate())s=MATE-(1);
        else s=-negamax(g,d-1,-INF,-alpha,1,stop);
        g.undo();
        if(timedOut)break;
        scored[i].s=s;
        if(s>alpha)alpha=s;
      }
      if(timedOut)break;
      depthReached=d;
      scored.sort(function(a,b){return b.s-a.s;});
      if(opts.resume&&Date.now()<stop&&d<maxD){
        return {done:false,state:{fen:st?st.fen:fen,scored:scored,depthReached:depthReached,stop:stop},
          partial:{best:scored[0]?{from:scored[0].m.from,to:scored[0].m.to,promotion:scored[0].m.promotion,san:scored[0].m.san}:null,score:scored[0]?scored[0].s:0,depth:depthReached}};
      }
      if(Date.now()>stop)break;
    }
    scored.sort(function(a,b){return b.s-a.s;});
    var top=scored.slice(0,3).map(function(x){return {san:x.m.san,from:x.m.from,to:x.m.to,promotion:x.m.promotion,score:x.s};});
    var b0=scored[0];
    return {done:true,moves:top,
      best:b0?{from:b0.m.from,to:b0.m.to,promotion:b0.m.promotion,san:b0.m.san}:null,
      score:b0?b0.s:0,depth:depthReached,nodes:nodes};
  }
  return {analyze:analyze,evaluate:evaluate};
}
