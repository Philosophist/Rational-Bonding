// Registering component in foo-component.js
AFRAME.registerComponent('s-orbital', {  
  init: function () {
    this.throttledOrbit = AFRAME.utils.throttle(this.everyOrbit, 250, this);
    this.throttledHalfOrbit = AFRAME.utils.throttle(this.everyHalfOrbit, 125, this);
  },

  everyOrbit: function () {
    if(this.animation.property.dir==='normal'){
      this.animation.property.dir='reverse';
    }else{this.animation.property.dir='normal';}
    this.animation();
  },

  everyHalfOrbit: function () {
    if(this.animation__rad.property.dir==='normal'){
      this.animation__rad.property.dir='reverse';
    }else{this.animation__rad.property.dir='normal';}
    this.animation__rad();
  },
  
  tick: function (t, dt) {
    this.throttledOrbit();
    this.throttledHalfOrbit();
  }
});