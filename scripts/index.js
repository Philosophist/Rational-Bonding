/* global AFRAME */

AFRAME.registerComponent('s-orbital', {

  init: function () {
    
    var self = this;
    
    setInterval(function () {
      self.el.emit('animate-rad');
      
      if ( self.el.is('cycle') ) {
        self.el.removeState('cycle');
        return;
      }
      
      self.el.emit('animate-pos');
      self.el.addState('cycle');
      
    }, 250);
    
  }
}