// Problem is probably rollOver.

function Overscroll() {
  this.MAX_OFFSET = 400;
  var self = this;
  var d = 0;
  var target = null;
  this.setTarget = function(t) {
    console.log("Set target ");
    target = t;
  }

  this.addFriction = function(delta) {
    if (delta < 0) {
      return delta;
    }

    delta = delta/this.MAX_OFFSET;
    if (delta > 1) {
      delta = 1;
    }
    return this.MAX_OFFSET * (delta/2 - delta/2 * delta/2);
  }

  this.reachedTarget = function() {
    if (Math.abs(d - target) < 1) {
      return true;
    }
  }

  this.step = function() {
    if (target === null) {
      return;
    }

    if (Math.abs(target - d) < 1) {
      d = target;
      target = null;
    } else {
      d += (target - d)/10.0;
    }
  }

  this.setOffset = function(o) {
    d = Math.min(o, this.MAX_OFFSET);
    target = null;
  }

  this.getOffset = function() {
    return d;
  }
}

Polymer('polymer-p2r', {
  ready: function() {
    var self = this;
    var scroller = self.$.scroller;
    var p2r = self.$.p2r;
    var scrollcontent = self.$.scrollcontent;
    var framePending = false;
    var pullStartY = 0;
    var lastY = 0;
    var loadingOffset = 150;
    var seenTouchMoveThisSequence = false;
    var fingersDown = 0;
    var overscroll = new Overscroll();

    function getHeaderClassName(name) {
      return self.className;
    }

    function setHeaderClassName(name) {
      self.className = name;
    }

    function translateY(element, offset) {
      element.style.webkitTransform = 'translate3d(0, ' + offset + 'px, 0)';
    }

    function checkPulled() {
      var triggerOffset = 60;
      if (getHeaderClassName() != 'loading') {
        setHeaderClassName(overscroll.getOffset() > triggerOffset ? 'pulled' : '');
      }
    }

    function onAnimationFrame() {
      framePending = false;
      checkPulled();
      var offset = overscroll.getOffset();
      if (scroller.scrollTop != 0 && offset != 0) {
        scroller.scrollTop = 0;
      }
      overscroll.step();
      if (offset < 0) {
        scroller.scrollTop = -offset;
        offset = 0;
      }
      translateY(scrollcontent, overscroll.addFriction(offset));
      translateY(p2r, overscroll.addFriction(offset) - p2r.clientHeight);
      if (!overscroll.reachedTarget()) {
        scheduleUpdate();
      }
    }

    function scheduleUpdate() {
      if (!framePending) {
        framePending = true;
        requestAnimationFrame(onAnimationFrame);
      }
    }


    function isP2rVisible() {
      return scroller.scrollTop <= overscroll.getOffset();
    }

    function isPulling() {
      return overscroll.getOffset() > 0.2;
    }

    function finishPull(e) {
      fingersDown--;

      if (!isPulling() || fingersDown != 0 || !isP2rVisible()) {
        return;
      }

      if (getHeaderClassName() == 'pulled') {
        setHeaderClassName('loading');
        setTimeout(finishLoading, 2000);
        overscroll.setTarget(loadingOffset);
      } else {
        overscroll.setTarget(Math.max(0, scroller.scrollTop));
      }
      scheduleUpdate();
    }

    function finishLoading() {
      setHeaderClassName('');
      if (isP2rVisible() && fingersDown == 0) {
        console.log("Reset on finishloading");
        overscroll.setTarget(Math.max(0, scroller.scrollTop));
        scheduleUpdate();
      }
    }

    scroller.addEventListener('touchstart', function(e) {
      // Can't actually do this, most likely, as it'll stop content from getting
      // touch starts? I guess I should really forward the event explicitly?
      e.preventDefault();
      lastY = e.touches[0].screenY;
      pullStartY = lastY;
      fingersDown++;
      seenTouchMoveThisSequence = false;

//      if (isPulling()) {
        pullStartY = e.touches[0].screenY - overscroll.getOffset();
        var offset = e.touches[0].screenY - pullStartY;
        overscroll.setOffset(offset);
        seenTouchMoveThisSequence = true;
//      }
    });

    scroller.addEventListener('touchmove', function(e) {
      e.preventDefault();

      var scrollDelta = lastY - e.touches[0].screenY;
      var startingNewPull = !isPulling() && scroller.scrollTop <= 0 && scrollDelta < 0;
      lastY = e.touches[0].screenY;

      var offset = e.touches[0].screenY - pullStartY;
      overscroll.setOffset(offset);
      scheduleUpdate();

      if (seenTouchMoveThisSequence && offset > 0) {
        // Don't preventDefault the first touchMove, it would prevent
        // scroll from occurring.
        e.preventDefault();
      }
      seenTouchMoveThisSequence = true;
    });

    scroller.addEventListener('touchcancel', finishPull);
    scroller.addEventListener('touchend', finishPull);
  }
});
