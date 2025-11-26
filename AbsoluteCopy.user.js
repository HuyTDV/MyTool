// ==UserScript==
// @name         Absolute Copy (Complete - Enable Right Click & Select)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Mở khóa chuột phải, cho phép bôi đen và copy ở mọi trang web (Fixed All Issues)
// @author       SinhVienIT (Enhanced)
// @match        *://*/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  // ================= TRẠNG THÁI =================
  let isEnabled = false;
  let styleElement = null;
  let toast = null;
  let mutationObserver = null;

  // ================= CSS MỞ KHÓA =================
  const cssUnlock = `
        * {
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
            pointer-events: auto !important;
        }
        
        /* Đặc biệt cho các overlay che phủ */
        div[style*="pointer-events: none"],
        div[style*="user-select: none"] {
            pointer-events: auto !important;
            user-select: text !important;
        }
    `;

  // ================= DANH SÁCH SỰ KIỆN =================
  const eventsToUnlock = [
    "contextmenu", // Chuột phải
    "copy", // Ctrl+C
    "cut", // Ctrl+X
    "paste", // Ctrl+V
    "mouseup", // Thả chuột
    "mousedown", // Nhấn chuột
    "keyup", // Thả phím
    "keydown", // Nhấn phím
    "drag", // Kéo thả
    "dragstart", // Bắt đầu kéo
    "select", // Bôi đen
    "selectstart", // Bắt đầu bôi đen
  ];

  // ================= HÀM XỬ LÝ SỰ KIỆN =================
  /**
   * GIẢI THÍCH: Hàm này chạy ở CAPTURING PHASE
   * - Capturing = Sự kiện đi từ window → element (từ trên xuống)
   * - Bubbling = Sự kiện đi từ element → window (từ dưới lên)
   *
   * Tại sao dùng Capturing?
   * - Web chống copy thường dùng addEventListener(event, handler, FALSE) = Bubbling
   * - Nếu ta chặn ở Capturing (TRUE) → chặn TRƯỚC KHI đến handler của web
   * - stopPropagation() = Ngăn event tiếp tục xuống element
   */
  function stopBlocking(e) {
    if (!isEnabled) return;
    e.stopPropagation();
    // KHÔNG dùng e.preventDefault() vì ta muốn giữ hành động mặc định
    // (ví dụ: hiện menu chuột phải)
  }

  // ================= GIAO DIỆN THÔNG BÁO =================
  function createToast() {
    const toastEl = document.createElement("div");
    toastEl.id = "absolute-copy-toast";

    Object.assign(toastEl.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      padding: "12px 24px",
      borderRadius: "8px",
      color: "white",
      fontWeight: "bold",
      zIndex: "2147483647", // Max 32-bit integer
      display: "none",
      fontFamily: "Arial, sans-serif",
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      transition: "opacity 0.5s, transform 0.3s",
      fontSize: "14px",
      transform: "translateY(0)",
      pointerEvents: "none", // Không chặn click
    });

    return toastEl;
  }

  function showToast(text, color) {
    if (!toast) return;

    toast.innerText = text;
    toast.style.backgroundColor = color;
    toast.style.display = "block";
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";

    // Animation fade out
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px)";
      setTimeout(() => {
        toast.style.display = "none";
      }, 500);
    }, 2000);
  }

  // ================= XỬ LÝ CSS INJECTION =================
  /**
   * GIẢI THÍCH: Tại sao cần MutationObserver?
   * - Một số web có script tự động XÓA các <style> tag không phải của họ
   * - Observer sẽ phát hiện khi styleElement bị xóa → tự động thêm lại
   * - Chỉ chạy khi isEnabled = true (tiết kiệm tài nguyên)
   */
  function injectCSS() {
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = "absolute-copy-style";
      styleElement.setAttribute("data-userscript", "absolute-copy");
    }

    styleElement.innerHTML = cssUnlock;

    // Append vào head hoặc documentElement
    const target = document.head || document.documentElement;
    if (!document.getElementById("absolute-copy-style")) {
      target.appendChild(styleElement);
    }

    // Bật MutationObserver để chống web xóa style
    startStyleProtection();
  }

  function removeCSS() {
    if (styleElement && styleElement.parentNode) {
      styleElement.innerHTML = ""; // Xóa nội dung trước (giải phóng memory)
      styleElement.remove();
    }

    // Tắt MutationObserver
    stopStyleProtection();
  }

  // ================= MUTATION OBSERVER (Chống xóa style) =================
  function startStyleProtection() {
    if (mutationObserver) return; // Đã chạy rồi

    mutationObserver = new MutationObserver((mutations) => {
      if (!isEnabled) return;

      // Kiểm tra xem style có bị xóa không
      if (!document.getElementById("absolute-copy-style")) {
        console.log("🛡️ Style bị xóa - Tự động khôi phục");
        injectCSS();
      }
    });

    // Theo dõi thay đổi trong <head> và <body>
    const target = document.head || document.documentElement;
    mutationObserver.observe(target, {
      childList: true, // Theo dõi thêm/xóa node
      subtree: false, // Chỉ cấp 1 (không cần deep)
    });
  }

  function stopStyleProtection() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
  }

  // ================= XỬ LÝ IFRAME =================
  /**
   * GIẢI THÍCH: Tại sao cần xử lý iframe?
   * - Nhiều trang nhúng nội dung qua <iframe>
   * - CSS và events của trang cha KHÔNG ảnh hưởng đến iframe
   * - Phải inject CSS và events VÀO TRONG iframe
   *
   * Lưu ý: Chỉ hoạt động với same-origin iframe
   * Cross-origin iframe sẽ throw SecurityError (bỏ qua)
   */
  function applyToIframes() {
    document.querySelectorAll("iframe").forEach((frame) => {
      try {
        const iframeDoc = frame.contentDocument || frame.contentWindow.document;

        if (iframeDoc) {
          // Inject CSS vào iframe
          let iframeStyle = iframeDoc.getElementById("absolute-copy-style");
          if (!iframeStyle && isEnabled) {
            iframeStyle = iframeDoc.createElement("style");
            iframeStyle.id = "absolute-copy-style";
            iframeStyle.innerHTML = cssUnlock;
            (iframeDoc.head || iframeDoc.documentElement).appendChild(
              iframeStyle
            );
          }

          // Gán events vào iframe window
          if (isEnabled) {
            eventsToUnlock.forEach((evt) => {
              frame.contentWindow.addEventListener(evt, stopBlocking, true);
            });
          }
        }
      } catch (e) {
        // Cross-origin iframe - bỏ qua (SecurityError)
        // Không log để tránh spam console
      }
    });
  }

  function removeFromIframes() {
    document.querySelectorAll("iframe").forEach((frame) => {
      try {
        const iframeDoc = frame.contentDocument || frame.contentWindow.document;
        const iframeStyle = iframeDoc?.getElementById("absolute-copy-style");

        if (iframeStyle) {
          iframeStyle.innerHTML = "";
          iframeStyle.remove();
        }

        // Gỡ events
        eventsToUnlock.forEach((evt) => {
          frame.contentWindow.removeEventListener(evt, stopBlocking, true);
        });
      } catch (e) {
        // Bỏ qua cross-origin
      }
    });
  }

  // ================= XỬ LÝ ONCLICK ATTRIBUTES =================
  /**
   * GIẢI THÍCH: Một số web dùng inline onclick="return false"
   * - addEventListener KHÔNG override được inline onclick
   * - Phải set trực tiếp onclick = null để vô hiệu hóa
   */
  function disableInlineHandlers() {
    document
      .querySelectorAll("[onclick], [oncontextmenu], [onselectstart]")
      .forEach((el) => {
        if (el.onclick && String(el.onclick).includes("return false")) {
          el.onclick = null;
        }
        if (el.oncontextmenu) el.oncontextmenu = null;
        if (el.onselectstart) el.onselectstart = null;
      });
  }

  // ================= TOGGLE CHỨC NĂNG =================
  function toggleMode() {
    isEnabled = !isEnabled;

    if (isEnabled) {
      console.log("🔓 ABSOLUTE COPY: ENABLED");

      // 1. Inject CSS
      injectCSS();

      // 2. Gán event listeners (Capturing Phase)
      eventsToUnlock.forEach((evt) => {
        window.addEventListener(evt, stopBlocking, true);
      });

      // 3. Xử lý iframe (nếu có)
      applyToIframes();

      // 4. Vô hiệu hóa inline onclick
      disableInlineHandlers();

      // 5. Theo dõi iframe mới được thêm vào
      // (Một số web load iframe động sau khi scroll)
      const iframeObserver = new MutationObserver(() => {
        if (isEnabled) applyToIframes();
      });
      iframeObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });

      showToast("🔓 ABSOLUTE COPY: ON", "#2e7d32");
    } else {
      console.log("🔒 ABSOLUTE COPY: DISABLED");

      // 1. Gỡ CSS
      removeCSS();

      // 2. Gỡ event listeners
      eventsToUnlock.forEach((evt) => {
        window.removeEventListener(evt, stopBlocking, true);
      });

      // 3. Gỡ khỏi iframe
      removeFromIframes();

      showToast("🔒 ABSOLUTE COPY: OFF", "#c62828");
    }
  }

  // ================= KHỞI TẠO =================
  /**
   * GIẢI THÍCH: Tại sao cần check document.readyState?
   * - Script chạy ở document-start = DOM chưa ready
   * - document.body có thể là NULL
   * - Phải đợi DOMContentLoaded hoặc check readyState
   */
  function init() {
    // Tạo toast notification
    toast = createToast();
    (document.body || document.documentElement).appendChild(toast);

    // Phím tắt Alt + X
    window.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        toggleMode();
      }
    });

    console.log(`
╔════════════════════════════════════════╗
║  📋 ABSOLUTE COPY v2.0 READY          ║
╠════════════════════════════════════════╣
║  ⌨️  Alt + X : Bật/Tắt tool           ║
║  🔓 Mở khóa: Copy, Select, Right Click║
║  🛡️  Auto protect style from removal  ║
║  🖼️  Support iframe (same-origin)     ║
╚════════════════════════════════════════╝
        `);
  }

  // Đợi DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // DOM đã ready rồi
    init();
  }
})();
