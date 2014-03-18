Polymer('polymer-p2r', {
  ready: function() {
    var self = this;
    var scroller = self.$.scroller;
    var p2r = self.$.p2r;
    var scrollcontent = self.$.scrollcontent;
    var framePending = false;
    var overscrollOffset = 0;
    var pullStartY = 0;
    var lastY = 0;
    var loadingOffset = 50;
    var seenTouchMoveThisSequence = false;
    var fingersDown = 0;
    var maxOffset = 200;

    function getHeaderClassName(name) {
      return self.className;
    }

    function setHeaderClassName(name) {
      self.className = name;
    }

    function translateY(element, offset) {
      element.style.webkitTransform = 'translate3d(0, ' + offset + 'px, 0)';
      window.getComputedStyle(element);
    }

    function checkPulled() {
      var triggerOffset = 60;
      if (getHeaderClassName() != 'loading') {
        setHeaderClassName(overscrollOffset > triggerOffset ? 'pulled' : '');
      }
    }

    function onAnimationFrame() {
      framePending = false;
      checkPulled();
      translateY(scrollcontent, addFriction(overscrollOffset));
      translateY(p2r, addFriction(overscrollOffset) - p2r.clientHeight);
    }

    function scheduleUpdate() {
      if (!framePending) {
        framePending = true;
        requestAnimationFrame(onAnimationFrame);
      }
    }

    function addFriction(delta) {
      return delta;
      var scale = 2;
      delta /= scale;

      // We want a curve that starts out linear, and slopes down
      // to slope=0 by maxDelta.
      var adj = delta - delta*delta/(2*maxOffset);
      return adj;
    }

    function setAnimationEnabled(enabled) {
      var val = enabled ? '-webkit-transform 0.2s ease-in-out' : '';
      scrollcontent.style.webkitTransition = val;
      p2r.style.webkitTransition = val;
    }

    function headerOffset() {
      return new WebKitCSSMatrix(window.getComputedStyle(scrollcontent).webkitTransform).m42;
    }

    function isP2rVisible() {
      return scroller.scrollTop <= headerOffset();
    }

    function isPulling() {
//      console.log("headerOffset is " + headerOffset());
//      return headerOffset() > 0 || overscrollOffset > 0;
      return headerOffset() > 0;
    }

    function finishPull(e) {
      fingersDown--;

      if (!isPulling() || fingersDown != 0 || !isP2rVisible()) {
        return;
      }

      if (getHeaderClassName() == 'pulled') {
        setHeaderClassName('loading');
        setTimeout(finishLoading, 2000);
        setAnimationEnabled(true);
        overscrollOffset = loadingOffset;
//        console.log("overscrollOffset = " + loadingOffset);
      } else {
        setAnimationEnabled(true);
        overscrollOffset = Math.max(0, scroller.scrollTop);
      }
      scheduleUpdate();
    }

    function finishLoading() {
      setHeaderClassName('');
      if (isP2rVisible() && fingersDown == 0) {
        setAnimationEnabled(true);
        console.log("Reset on finishloading");
        overscrollOffset = Math.max(0, scroller.scrollTop);
        scheduleUpdate();
      }
    }

    scroller.addEventListener('touchstart', function(e) {
      lastY = e.touches[0].screenY;
      fingersDown++;
      seenTouchMoveThisSequence = false;
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
      var scrollDelta = lastY - e.touches[0].screenY;
      var startingNewPull = !isPulling() && scroller.scrollTop <= 0 && scrollDelta < 0;

      if (isPulling() && !seenTouchMoveThisSequence) {
        console.log("CONTINUE PULL");
        pullStartY = lastY - headerOffset();
        seenTouchMoveThisSequence = true;
        return;
      }

      if (startingNewPull) {
        console.log("STARTING NEW PULL at " + e.touches[0].screenY);
        // Can't use lastY, it's invalid if you wiggle up and down enough
        pullStartY = e.touches[0].screenY - 1;
      }

      lastY = e.touches[0].screenY;
//      console.log("CUR POSITION IS " + e.touches[0].screenY);

      if (!startingNewPull && !isPulling()) {
        scroller.scrollTop = 100;
        console.log("GET OUT");
        return;
      }

//      console.log("offset is " + offset);

      setAnimationEnabled(false);
      var offset = e.touches[0].screenY - pullStartY;
      overscrollOffset = Math.max(0, Math.min(offset, maxOffset));
      scheduleUpdate();

      if (seenTouchMoveThisSequence && offset > 0) {
        console.log("preventDefault");
        // Don't preventDefault the first touchMove, it would prevent
        // scroll from occurring.
        e.preventDefault();
      }
      seenTouchMoveThisSequence = true;
    });

//    scroller.addEventListener('touchcancel', finishPull);
//    scroller.addEventListener('touchend', finishPull);
  }
});
