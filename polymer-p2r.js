// Try only setting friction on draw, and then reading the offset out of the overscroll object when finding start.

var MAX_OFFSET = 400;

function addFriction(delta) {
  if (delta < 0) {
    return delta;
  }
  var scale = 1;
  delta /= scale;

  // We want a curve that starts out linear, and slopes down
  // to slope=0 by maxDelta.
  var adj = delta - delta*delta/(2*MAX_OFFSET);
  return adj;
}

function Overscroll() {
  var self = this;
  var d = 0;
  var target = 0;
  this.setTarget = function(t) {
    target = t;
  }

  this.reachedTarget = function() {
    if (Math.abs(d - this.target) < 1) {
      return true;
    }
  }

  this.step = function(t) {
    if (Math.abs(this.target - d) < 1) {
      d = target;
    } else {
      d += (target - d)/10.0;
    }
  }

  this.setOffset = function(o) {
//    console.log("setOffset " + o);
    d = Math.max(0, Math.min(o, MAX_OFFSET));
    target = d;
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
    var loadingOffset = 50;
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
      overscroll.step();
      var offset = overscroll.getOffset();
      if (offset < 0) {
        offset = 0;
//        scroller.scrollTop = -offset;
//        console.log("Set scrollTop to " + -offset);
      }
      translateY(scrollcontent, overscroll.getOffset());
      translateY(p2r, overscroll.getOffset() - p2r.clientHeight);
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
//      console.log("overscroll.getOffset is " + overscroll.getOffset());
//      return overscroll.getOffset() > 0 || overscrollOffset > 0;
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
        //overscrollOffset = loadingOffset;
//        console.log("overscrollOffset = " + loadingOffset);
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
      lastY = e.touches[0].screenY;
      pullStartY = lastY;
      fingersDown++;
      seenTouchMoveThisSequence = false;

      if (isPulling()) {
        console.log("CONTINUE PULL");
        pullStartY = e.touches[0].screenY - overscroll.getOffset();
        console.log("pullStartY " + pullStartY);
        console.log("lastOffsetPreFriction " + lastOffsetPreFriction);
        var offset = e.touches[0].screenY - pullStartY;
        overscroll.setOffset(offset);
        console.log("SET OFFSET TO " + offset);
        seenTouchMoveThisSequence = true;
      }

//      if (e.touches.length == 1 && !isP2rVisible()) {
//        if (getHeaderClassName() != '') {
//          console.log("Reset for touchstart");
//          setAnimationEnabled(false);
//          scroller.scrollTop -= overscrollOffset;
//          overscrollOffset = 0;
//          scheduleUpdate();
//        }
//      }
    });

    scroller.addEventListener('touchmove', function(e) {
      e.preventDefault();

      var scrollDelta = lastY - e.touches[0].screenY;
      var startingNewPull = !isPulling() && scroller.scrollTop <= 0 && scrollDelta < 0;

      if (startingNewPull) {
        console.log("STARTING NEW PULL at " + e.touches[0].screenY);
        // Can't use lastY, it's invalid if you wiggle up and down enough
        pullStartY = e.touches[0].screenY - 1;
      } else if (!seenTouchMoveThisSequence) {
        return;
      }

      lastY = e.touches[0].screenY;
//      console.log("CUR POSITION IS " + e.touches[0].screenY);

      if (!startingNewPull && !isPulling()) {
//        console.log("GET OUT");
//        return;
      }

      var offset = e.touches[0].screenY - pullStartY;
      console.log("offset is " + offset);
      lastOffsetPreFriction = offset;
//      overscroll.setOffset(addFriction(offset));
      overscroll.setOffset(offset);
      scheduleUpdate();

      if (seenTouchMoveThisSequence && offset > 0) {
//        console.log("preventDefault");
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
