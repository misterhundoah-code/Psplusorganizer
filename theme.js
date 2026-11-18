// Applies the saved colour theme before the page draws, so there is no flash.
// "light" or "dark" overrides the device setting; no saved value follows the device.
(function () {
  try {
    var t = localStorage.getItem("psplus-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
