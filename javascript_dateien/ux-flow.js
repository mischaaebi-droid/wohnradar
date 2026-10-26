"use strict";
/* Nur Sichtbarkeit, Reihenfolge und Reset. Keine Änderung am Bewertungsmodell. */
(()=>{
 const $=id=>document.getElementById(id);
 const shell=$('resultShell'), main=document.querySelector('.layout main'),header=document.querySelector('header');
 if(!shell||!main||!header)return;
 const anchor=document.createComment('Ursprüngliche Desktop-Position');shell.parentNode.insertBefore(anchor,shell);
 const mobile=window.matchMedia('(max-width:840px)');
 function arrange(){if(mobile.matches)header.insertAdjacentElement('afterend',shell);else anchor.parentNode.insertBefore(shell,anchor.nextSibling)}
 arrange();window.addEventListener('resize',arrange);
 function show(){shell.classList.add('has-estimate');if(mobile.matches)window.scrollTo({top:0,behavior:'smooth'})}
 $('estimateButtonDesktop').addEventListener('click',show);
 $('estimateButtonMobile').addEventListener('click',show);
 $('adjustButton').addEventListener('click',()=>{if(mobile.matches)shell.classList.remove('has-estimate');main.querySelector('.card')?.scrollIntoView({behavior:'smooth',block:'start'})});
 $('uxReset').addEventListener('click',()=>{
  const original=$('reset');if(original)original.click();
  main.querySelectorAll('input[type=range]').forEach(el=>{el.value=el.min;el.dispatchEvent(new Event('input',{bubbles:true}))});
  shell.classList.remove('has-estimate');
  if(mobile.matches)window.scrollTo({top:0,behavior:'smooth'});
 });
})();
