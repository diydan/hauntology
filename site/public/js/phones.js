/* Phones demo: a strip of phones lights in greys. Slow fades, a pause between shakes, none under reduced motion. */
(function(){
  var sp=Array.prototype.slice.call(document.querySelectorAll('#strip .sp'));
  var btn=document.getElementById('shake'),rst=document.getElementById('newturn');
  if(!sp.length||!btn||!rst)return;
  var cnt=document.getElementById('shakecount'),tag=document.getElementById('shaketag'),txt=document.getElementById('shaketext');
  var lv=Array.prototype.slice.call(document.querySelectorAll('#lvl i'));
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var n=0,busy=false,timer=0;
  var MAX=6;
  var words=[
    ['A creak','The floorboards creak, somewhere below.'],
    ['Wind','A wind passes through the house.'],
    ['A rumble','The whole house rumbles.']
  ];
  function level(k){return k<=2?1:k<=4?2:3;}
  var BASE='#171c20',MID='#3a4248',PALE='#aeb4b8',DARK='#0a0c0e';
  function play(l){
    var d=0;
    if(reduce){
      sp.forEach(function(e){e.classList.add('lit');});
      return 2000;
    }
    if(l===1){
      sp.forEach(function(e){e.animate([{backgroundColor:BASE},{backgroundColor:MID},{backgroundColor:BASE}],{duration:3000,easing:'ease-in-out'});});
      d=3000;
    }else if(l===2){
      sp.forEach(function(e,i){e.animate([{backgroundColor:BASE},{backgroundColor:MID,offset:.5},{backgroundColor:BASE}],{duration:1600,delay:i*700,easing:'ease-in-out'});});
      d=1600+700*(sp.length-1);
    }else{
      sp.forEach(function(e){e.animate([{backgroundColor:BASE},{backgroundColor:DARK,offset:.3},{backgroundColor:DARK,offset:.45},{backgroundColor:PALE,offset:.8},{backgroundColor:BASE}],{duration:6000,easing:'ease-in-out'});});
      d=6000;
    }
    return d;
  }
  function paint(){
    cnt.textContent=n+' / '+MAX+' shakes';
    var l=n?level(n):0;
    lv.forEach(function(e,i){e.className=i<l?'on':'';});
    if(!n){tag.textContent='Waiting';txt.textContent='Tap to try it. In the game, only players who have joined the haunting can shake, and nobody sees who did it until the game ends.';}
  }
  btn.addEventListener('click',function(){
    if(busy||n>=MAX)return;
    n++;
    var l=level(n);
    var w=words[l-1];
    tag.textContent=w[0]+' \u00b7 level '+l;
    txt.textContent=w[1]+(n>=MAX?' That is the most the table can do in one turn.':'');
    paint();tag.textContent=w[0]+' \u00b7 level '+l;
    busy=true;btn.disabled=true;
    var d=Math.max(4000,play(l));
    clearTimeout(timer);
    timer=setTimeout(function(){
      busy=false;btn.disabled=(n>=MAX);
      sp.forEach(function(e){e.classList.remove('lit');});
    },d);
  });
  rst.addEventListener('click',function(){
    clearTimeout(timer);busy=false;n=0;btn.disabled=false;
    sp.forEach(function(e){e.classList.remove('lit');e.getAnimations().forEach(function(a){a.cancel();});});
    paint();
  });
  paint();
})();
