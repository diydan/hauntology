/* Hero figure: a photo on the left, a procedural point cloud on the right. */
(function(){
  var stage=document.getElementById('stage');
  var cw=document.getElementById('world'), cp=document.getElementById('photo');
  var rev=document.getElementById('reveal');
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp=function(v){return v<0?0:v>255?255:v;};
  function rng(seed){var s=seed>>>0;return function(){s=(s+0x6D2B79F5)>>>0;var t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  var R=rng(1914);

  /* kinds: 0 solid, 1 ghost, 2 ghost eye, 3 ground */
  var P=[];
  function put(x,y,z,c,s,k){
    var d=(R()-.5)*26;
    var r=clamp(c[0]+d),g=clamp(c[1]+d),b=clamp(c[2]+d);
    P.push({x:x,y:y,z:z,r:r,g:g,b:b,s:s,k:k||0,css:'rgb('+(r|0)+','+(g|0)+','+(b|0)+')'});
  }
  function inRect(x,y,x0,x1,y0,y1){return x>x0&&x<x1&&y>y0&&y<y1;}

  var WALL=[[206,200,182],[132,128,118],[170,165,150],[150,146,134]];
  var GLASS=[154,211,201], DOOR=[150,58,42], SLATE=[84,96,108], SLATE2=[104,116,128], WOOD=[66,74,72];
  var i,j;
  for(i=0;i<1250;i++){
    var f=Math.floor(R()*4);
    var x=-2+R()*4,y=R()*2.4,z=-1.5+R()*3,c=WALL[f],s=1.05;
    if(f===0)z=1.5;else if(f===1)z=-1.5;else if(f===2)x=2;else x=-2;
    if(f===0){
      if(inRect(x,y,-1.6,-.7,1.05,1.95)||inRect(x,y,.7,1.6,1.05,1.95))continue;
      if(inRect(x,y,-.32,.32,0,1.55)){c=DOOR;s=1.1;}
    }
    if(f===2&&inRect(z,y,-.5,.5,1.05,1.95))continue;
    put(x,y,z,c,s,0);
  }
  for(i=0;i<60;i++){
    put(-1.6+R()*.9,1.05+R()*.9,1.52,GLASS,1.35,0);
    put(.7+R()*.9,1.05+R()*.9,1.52,GLASS,1.35,0);
    if(i<40)put(2.02,1.05+R()*.9,-.5+R(),GLASS,1.3,0);
  }
  for(i=0;i<680;i++){
    var u=R()*2-1;
    put(u*2.35,2.4+(1-Math.abs(u))*1.3,-1.75+R()*3.5,u<0?SLATE:SLATE2,1.1,0);
  }
  for(i=0;i<180;i++){
    var zf=i%2?1.5:-1.5,gx=-2+R()*4,top=2.4+(1-Math.abs(gx)/2.35)*1.3;
    put(gx,2.4+R()*(top-2.4),zf,i%2?WALL[0]:WALL[1],1,0);
  }
  for(i=0;i<130;i++){
    var cf=Math.floor(R()*4),cx2=.8+R()*.5,cy2=2.8+R()*1.4,cz2=-.9+R()*.5;
    if(cf===0)cz2=-.4;else if(cf===1)cz2=-.9;else if(cf===2)cx2=1.3;else cx2=.8;
    put(cx2,cy2,cz2,[118,92,84],1,0);
  }
  for(i=0;i<820;i++){
    var a=R()*Math.PI*2,rr=6.2*Math.sqrt(R());
    put(Math.cos(a)*rr,0,Math.sin(a)*rr,[74,88,84],.8,3);
  }
  for(i=0;i<130;i++)put(-.45+R()*.9,0,1.6+R()*4.4,[140,142,128],.8,3);
  function tree(tx,tz,h,lean){
    var q;
    for(q=0;q<55;q++){var ty=R()*h;put(tx+lean*ty*.1+(R()-.5)*.08,ty,tz+(R()-.5)*.08,WOOD,.9,0);}
    for(var b=0;b<6;b++){
      var y0=h*(.45+R()*.45),ang=R()*Math.PI*2,up=.5+R()*.6,L=.7+R()*.8;
      for(q=0;q<20;q++){var t=q/19;put(tx+Math.cos(ang)*L*t,y0+up*L*t,tz+Math.sin(ang)*L*t,WOOD,.8,0);}
    }
  }
  tree(-3.6,1.6,2.8,-1);tree(3.8,-1.2,3.2,1);tree(-4.6,-2.6,2.4,.5);
  for(i=0;i<360;i++){
    var v=R(),ga=R()*Math.PI*2;
    var gr=v>.74?.34*Math.sqrt(Math.max(0,1-Math.pow((v-.74)/.26,2))):.34+(.74-v)*.42;
    var gy=v*1.6;if(v<.14)gy+=Math.sin(ga*5)*.07;
    put(Math.cos(ga)*gr,gy,Math.sin(ga)*gr,[200,238,230],1.5,1);
  }
  put(-.12,1.3,.34,[8,14,16],1.2,2);put(.12,1.3,.34,[8,14,16],1.2,2);

  var N=P.length;
  var PX=new Float32Array(N),PY=new Float32Array(N),PZ=new Float32Array(N),PF=new Float32Array(N);
  var ord=[];for(j=0;j<N;j++)ord.push(j);
  var cam={};
  function setCam(W,H,yaw,pitch){
    cam.cy=Math.cos(yaw);cam.sy=Math.sin(yaw);cam.ct=Math.cos(pitch);cam.st=Math.sin(pitch);
    cam.D=15;cam.foc=W*1.12;cam.cx=W/2;cam.cyy=H*.6;
  }
  function pt(x,y,z,out){
    var x1=x*cam.cy+z*cam.sy,z1=-x*cam.sy+z*cam.cy,y1=y-1.6;
    var y2=y1*cam.ct-z1*cam.st,z2=y1*cam.st+z1*cam.ct;
    var d=cam.D-z2,f=cam.foc/d;
    out[0]=cam.cx+x1*f;out[1]=cam.cyy-y2*f;out[2]=d;out[3]=f;
  }
  var tmp=[0,0,0,0];
  function project(t){
    var bob=Math.sin(t*1.4)*.12,drift=Math.sin(t*.7)*.25;
    for(var n=0;n<N;n++){
      var p=P[n],x=p.x,y=p.y,z=p.z;
      if(p.k===1||p.k===2){x+=3.1+drift;y+=.55+bob;z+=2;}
      pt(x,y,z,tmp);
      PX[n]=tmp[0];PY[n]=tmp[1];PZ[n]=tmp[2];PF[n]=tmp[3];
    }
    ord.sort(function(a,b){return PZ[b]-PZ[a];});
  }

  function fit(c){
    var r=c.getBoundingClientRect();
    var dpr=Math.min(window.devicePixelRatio||1,2);
    c.width=Math.max(1,Math.round(r.width*dpr));c.height=Math.max(1,Math.round(r.height*dpr));
    var ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    return {ctx:ctx,W:r.width,H:r.height};
  }
  var wv=null;

  function drawWorld(t,yaw,pitch){
    var ctx=wv.ctx,W=wv.W,H=wv.H;
    var g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#080b0e');g.addColorStop(.6,'#141b21');g.addColorStop(1,'#0e1317');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    setCam(W,H,yaw,pitch);
    project(t);
    /* the board: a faint grid on the ground */
    ctx.strokeStyle='rgba(154,211,201,.17)';ctx.lineWidth=1;
    var a,b,k;
    for(a=-6;a<=6;a+=3){
      ctx.beginPath();
      for(b=-6;b<=6;b+=1){pt(a,0,b,tmp);if(b===-6)ctx.moveTo(tmp[0],tmp[1]);else ctx.lineTo(tmp[0],tmp[1]);}
      ctx.stroke();
      ctx.beginPath();
      for(b=-6;b<=6;b+=1){pt(b,0,a,tmp);if(b===-6)ctx.moveTo(tmp[0],tmp[1]);else ctx.lineTo(tmp[0],tmp[1]);}
      ctx.stroke();
    }
    for(k=0;k<N;k++){
      var n=ord[k],p=P[n];
      var r=Math.max(.8,p.s*PF[n]*.062);
      ctx.globalAlpha=p.k===1?.26:p.k===3?.6:p.k===2?.95:.86;
      ctx.fillStyle=p.css;
      ctx.beginPath();ctx.arc(PX[n],PY[n],r,0,6.2832);ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  function drawPhoto(){
    var ph=fit(cp),ctx=ph.ctx,W=ph.W,H=ph.H;
    var bg=ctx.createRadialGradient(W/2,H*.45,W*.1,W/2,H*.5,W*.75);
    bg.addColorStop(0,'#3a3226');bg.addColorStop(1,'#14110d');
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    setCam(W,H,.05,.13);
    project(0);
    for(var k=0;k<N;k++){
      var n=ord[k],p=P[n];
      if(p.k===2)continue;
      var lum=.3*p.r+.59*p.g+.11*p.b;
      var r=Math.max(1,p.s*PF[n]*.07);
      if(p.k===1){ctx.globalAlpha=.08;r*=2.6;}
      else ctx.globalAlpha=p.k===3?.55:.82;
      ctx.fillStyle='rgb('+(clamp(lum*1.3)|0)+','+(clamp(lum*1.08)|0)+','+(clamp(lum*.82)|0)+')';
      ctx.fillRect(PX[n]-r,PY[n]-r,r*2,r*2);
    }
    ctx.globalAlpha=1;
    var gr=Math.round(W*H/90),q;
    for(q=0;q<gr;q++){
      ctx.fillStyle=R()<.5?'rgba(255,245,225,.07)':'rgba(0,0,0,.14)';
      ctx.fillRect(R()*W,R()*H,1.2,1.2);
    }
    ctx.strokeStyle='rgba(255,245,225,.09)';ctx.lineWidth=1;
    for(q=0;q<4;q++){var sx=R()*W;ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx+(R()-.5)*8,H);ctx.stroke();}
    var vg=ctx.createRadialGradient(W/2,H/2,W*.25,W/2,H/2,W*.72);
    vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.55)');
    ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(233,229,216,.22)';ctx.strokeRect(10.5,10.5,W-21,H-21);
  }

  var yawOff=0,yawT=0,pitchOff=0,pitchT=0,raf=0,t0=performance.now(),running=false;
  function tick(now){
    var t=(now-t0)/1000;
    yawOff+=(yawT-yawOff)*.06;pitchOff+=(pitchT-pitchOff)*.06;
    drawWorld(t,Math.sin(t*.35)*.5+yawOff,.2+pitchOff);
    raf=requestAnimationFrame(tick);
  }
  function still(){drawWorld(0,.3+yawT,.2+pitchT);}
  function start(){if(!running&&!reduce){running=true;raf=requestAnimationFrame(tick);}}
  function stop(){running=false;cancelAnimationFrame(raf);}

  var shotDone=false;
  function makeShot(){
    try{
      drawWorld(0,.42,.2);
      var u=cw.toDataURL('image/jpeg',.82);
      Array.prototype.forEach.call(document.querySelectorAll('.screen-shot'),function(e){e.style.backgroundImage='url('+u+')';});
    }catch(err){}
  }
  function layout(){
    wv=fit(cw);
    drawPhoto();
    if(!shotDone){shotDone=true;makeShot();}
    if(reduce)still();
  }
  layout();
  if(window.ResizeObserver){new ResizeObserver(layout).observe(stage);}else{window.addEventListener('resize',layout);}
  if(window.IntersectionObserver&&!reduce){
    new IntersectionObserver(function(es){es[0].isIntersecting?start():stop();}).observe(stage);
  }else start();

  stage.addEventListener('pointermove',function(e){
    var r=stage.getBoundingClientRect();
    yawT=((e.clientX-r.left)/r.width-.5)*.7;
    pitchT=((e.clientY-r.top)/r.height-.5)*.12;
    if(reduce)still();
  });
  function setPos(){stage.style.setProperty('--pos',rev.value+'%');}
  rev.addEventListener('input',setPos);setPos();
  /* one slow nudge so people see the slider moves; any touch cancels it */
  var touched=false;
  ['pointerdown','keydown','input'].forEach(function(ev){rev.addEventListener(ev,function(){touched=true;});});
  if(!reduce){
    setTimeout(function(){
      var s0=performance.now(),dur=2800;
      (function sweep(now){
        if(touched)return;
        var k=Math.min(1,(now-s0)/dur);
        rev.value=50+38*Math.sin(k*Math.PI);setPos();
        if(k<1)requestAnimationFrame(sweep);
      })(s0);
    },900);
  }
})();

/* The Haunt demo */
(function(){
  var MAX=10,MARKS=[3,6,9];
  var PAIRS={3:['Cold Spot','Blackout'],6:['Restless','Lull'],9:['Blackout','Lull']};
  var FX={'Cold Spot':'No one can make a suggestion in one zone for a round.','Blackout':'The next turn is 15 seconds shorter and the lights dim.','Restless':'The ghost drifts to another zone.','Lull':'The Haunt falls by 1.'};
  var START='Press a button to push the Haunt up.';
  var track=document.getElementById('track'),out=document.getElementById('hv'),msg=document.getElementById('msg'),opts=document.getElementById('opts');
  var adds=Array.prototype.slice.call(document.querySelectorAll('[data-add]'));
  var level=0,fired={},pending=false,over=false,segs=[],i;
  for(i=1;i<=MAX;i++){
    var s=document.createElement('span');
    s.className='seg'+(MARKS.indexOf(i)>-1?' mark':'');
    if(MARKS.indexOf(i)>-1)s.setAttribute('data-n',i);
    track.appendChild(s);segs.push(s);
  }
  function render(){
    segs.forEach(function(s,n){s.classList.toggle('on',n<level);});
    out.textContent=level+' / '+MAX;
    adds.forEach(function(b){b.disabled=pending||over;});
  }
  function choose(name){
    if(name==='Lull')level=Math.max(0,level-1);
    pending=false;opts.replaceChildren();
    msg.textContent=name+'. '+FX[name];
    render();
  }
  function bump(why){
    if(pending||over)return;
    level=Math.min(MAX,level+1);
    opts.replaceChildren();
    if(level>=MAX){
      over=true;
      msg.textContent=why+' The Haunt is full. The house wins, and nobody else does.';
    }else if(MARKS.indexOf(level)>-1&&!fired[level]){
      fired[level]=true;pending=true;
      msg.textContent=why+' The house stirs at '+level+'. Choose what it does:';
      PAIRS[level].forEach(function(name){
        var b=document.createElement('button');
        b.type='button';b.className='opt';
        var st=document.createElement('strong');st.textContent=name;
        b.appendChild(st);b.appendChild(document.createTextNode(FX[name]));
        b.addEventListener('click',function(){choose(name);});
        opts.appendChild(b);
      });
    }else msg.textContent=why;
    render();
  }
  adds.forEach(function(b){b.addEventListener('click',function(){bump(b.getAttribute('data-why'));});});
  document.getElementById('reset').addEventListener('click',function(){
    level=0;fired={};pending=false;over=false;opts.replaceChildren();msg.textContent=START;render();
  });
  render();
})();

/* Hero: the place in the first line changes */
(function(){
  var items=Array.prototype.slice.call(document.querySelectorAll('.rot-item'));
  var copy=document.querySelector('.rotrow').parentNode;
  if(items.length<2)return;
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var i=0,timer=0,userPaused=reduce,hovering=false;
  function show(n){
    var cur=items[i],nxt=items[n];
    cur.classList.remove('is-on');cur.classList.add('is-out');cur.setAttribute('aria-hidden','true');
    nxt.classList.remove('is-out');nxt.classList.add('is-on');nxt.removeAttribute('aria-hidden');
    i=n;
    setTimeout(function(){cur.classList.remove('is-out');},650);
  }
  function next(){if(!userPaused&&!hovering)show((i+1)%items.length);}
  copy.addEventListener('mouseenter',function(){hovering=true;});
  copy.addEventListener('mouseleave',function(){hovering=false;});
  copy.addEventListener('focusin',function(){hovering=true;});
  copy.addEventListener('focusout',function(){hovering=false;});
  timer=setInterval(next,3200);
})();
