// ==UserScript==
// @name         Auto Register Subject (Enhanced - Smart Stop)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Ctrl+M để chạy -> Tự dừng khi thành công + Timeout + Error handling
// @author       SinhVienIT (Enhanced)
// @match        https://dangkyhoc.truong-cua-ban.edu.vn/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ================= CẤU HÌNH =================
  const CONFIG = {
    tuKhoaThanhCong: ["thành công", "đã đăng ký", "success", "lưu"],
    maxRuntime: 5 * 60 * 1000, // 5 phút (ms)
    clickInterval: 50, // 50ms mỗi lần check
    enableTimeout: true, // Bật/tắt timeout
  };

  // ================= BIẾN TRẠNG THÁI =================
  let isSpamming = false;
  let startTime = null;
  let clickCount = 0;

  // ================= GIAO DIỆN TRẠNG THÁI =================
  const statusBox = document.createElement("div");
  Object.assign(statusBox.style, {
    position: "fixed",
    bottom: "10px",
    right: "10px",
    padding: "12px 24px",
    borderRadius: "8px",
    color: "white",
    fontWeight: "bold",
    fontFamily: "Arial, sans-serif",
    zIndex: "99999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    fontSize: "14px",
    transition: "all 0.3s",
    minWidth: "280px",
    textAlign: "center",
  });
  document.body.appendChild(statusBox);

  function updateStatusUI(state, extra = "") {
    const elapsedTime = startTime
      ? Math.floor((Date.now() - startTime) / 1000)
      : 0;

    if (state === "RUNNING") {
      statusBox.innerHTML = `🔥 ĐANG SPAM CLICK...<br><small>Đã chạy: ${elapsedTime}s | Click: ${clickCount}</small>`;
      statusBox.style.backgroundColor = "#d32f2f";
    } else if (state === "SUCCESS") {
      statusBox.innerHTML = `✅ ĐÃ XONG MÔN NÀY!<br><small>Chọn môn tiếp và bấm Ctrl+M</small>`;
      statusBox.style.backgroundColor = "#2e7d32";
    } else if (state === "TIMEOUT") {
      statusBox.innerHTML = `⏱️ HẾT THỜI GIAN!<br><small>${extra}</small>`;
      statusBox.style.backgroundColor = "#f57c00";
    } else if (state === "ERROR") {
      statusBox.innerHTML = `❌ LỖI!<br><small>${extra}</small>`;
      statusBox.style.backgroundColor = "#c62828";
    } else {
      statusBox.innerHTML = `💤 ĐANG CHỜ<br><small>Tích môn → Bấm Ctrl+M để bắt đầu</small>`;
      statusBox.style.backgroundColor = "#1976d2";
    }
  }

  updateStatusUI("IDLE");

  // ================= XỬ LÝ PHÍM TẮT (Ctrl + M) =================
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      isSpamming = !isSpamming;

      if (isSpamming) {
        console.log("🚀 KÍCH HOẠT TOOL");
        startTime = Date.now();
        clickCount = 0;
        updateStatusUI("RUNNING");
      } else {
        console.log("🛑 DỪNG THỦ CÔNG");
        startTime = null;
        updateStatusUI("IDLE");
      }
    }
  });

  // ================= HÀM HỖ TRỢ =================
  function getElement(xpath) {
    try {
      return document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
    } catch (err) {
      console.error("XPath Error:", err);
      return null;
    }
  }

  function getElementFlexible() {
    // Thử nhiều cách tìm nút - ưu tiên class > context > text
    const selectors = [
      // 1. XPath cũ (tuyệt đối) - ưu tiên cao nhất
      "/html/body/app-root/common-app-component/p-confirmdialog[1]/div/div[3]/button[1]/span[2]",
      "/html/body/div[1]/div[3]/p-footer/button[1]/span[2]",

      // 2. XPath theo class - an toàn
      "//button[contains(@class, 'p-confirm')]//span",
      "//p-footer//button[contains(@class, 'p-button-success')]//span",
      "//button[contains(@class, 'p-button-primary')]//span",

      // 3. XPath theo context + text - có kiểm soát
      "//p-dialog//button[contains(., 'Xác nhận')]",
      "//p-footer//button[contains(., 'Đăng ký')]",
      "//div[contains(@class, 'dialog')]//button[contains(., 'Xác nhận')]",

      // 4. Fallback cuối cùng - CHỈ trong dialog/footer
      "//p-dialog//button[not(contains(., 'Hủy')) and not(contains(., 'Đóng'))]",
      "//p-footer//button[not(contains(., 'Hủy'))]",
    ];

    for (const xpath of selectors) {
      const el = getElement(xpath);
      if (el) {
        // Tìm button cha (vì có thể return span)
        const button = el.tagName === "BUTTON" ? el : el.closest("button");

        // Validate: không phải nút nguy hiểm
        if (button && !isDangerousButton(button)) {
          return button;
        }
      }
    }

    return null;
  }

  function isDangerousButton(button) {
    const dangerousKeywords = [
      "hủy",
      "cancel",
      "đóng",
      "close",
      "xóa",
      "delete",
      "đăng xuất",
      "logout",
      "hủy đăng ký",
    ];

    const buttonText = button.innerText.toLowerCase();
    const buttonClass = button.className.toLowerCase();

    // Check text và class
    for (const keyword of dangerousKeywords) {
      if (buttonText.includes(keyword) || buttonClass.includes(keyword)) {
        console.warn(`⚠️ Bỏ qua nút nguy hiểm: "${buttonText}"`);
        return true;
      }
    }

    // Check class nguy hiểm
    if (buttonClass.includes("danger") || buttonClass.includes("secondary")) {
      return true;
    }

    return false;
  }

  function checkSuccessAndStop() {
    try {
      // Ưu tiên kiểm tra trong dialog/alert box
      const alertSelectors = [
        ".p-dialog-content",
        ".p-toast-message",
        ".alert",
        ".notification",
        '[role="alert"]',
      ];

      for (const selector of alertSelectors) {
        const alertBox = document.querySelector(selector);
        if (alertBox) {
          const text = alertBox.innerText.toLowerCase();
          for (const kw of CONFIG.tuKhoaThanhCong) {
            if (text.includes(kw)) {
              return true;
            }
          }
        }
      }

      // Fallback: Kiểm tra toàn bộ body (ít chính xác hơn)
      const bodyText = document.body.innerText.toLowerCase();
      for (const kw of CONFIG.tuKhoaThanhCong) {
        if (bodyText.includes(kw)) {
          // Double check: Không phải là text cũ
          const recentText = document.querySelector(
            ".p-dialog, .modal, .popup"
          );
          if (recentText && recentText.innerText.toLowerCase().includes(kw)) {
            return true;
          }
        }
      }

      return false;
    } catch (err) {
      console.error("Lỗi khi check success:", err);
      return false;
    }
  }

  // ================= LOGIC CHÍNH =================
  function autoClicker() {
    if (!isSpamming) {
      startTime = null;
      return;
    }

    try {
      // 1. Kiểm tra timeout
      if (CONFIG.enableTimeout && startTime) {
        const elapsed = Date.now() - startTime;
        if (elapsed > CONFIG.maxRuntime) {
          isSpamming = false;
          console.log("⏱️ TIMEOUT - Dừng tool");
          updateStatusUI("TIMEOUT", "Vui lòng kiểm tra lại");
          alert(
            "⏱️ Tool đã chạy quá 5 phút!\nVui lòng kiểm tra lại môn học hoặc thử lại."
          );
          return;
        }
      }

      // 2. Kiểm tra thành công -> Dừng ngay
      if (checkSuccessAndStop()) {
        isSpamming = false;
        console.log("✅ PHÁT HIỆN THÀNH CÔNG -> DỪNG TOOL");
        updateStatusUI("SUCCESS");
        // Có thể bỏ comment dòng này nếu muốn alert
        // alert("✅ Đăng ký thành công! Chọn môn tiếp đi.");
        return;
      }

      // 3. Click logic với kiểm tra đầy đủ
      const button = getElementFlexible();

      if (button) {
        // Check: visible + enabled + không bị readonly
        const isVisible = button.offsetParent !== null;
        const isEnabled = !button.disabled && !button.hasAttribute("disabled");
        const isClickable = !button.classList.contains("p-disabled");
        const notLoading = !button.classList.contains("p-button-loading");

        if (isVisible && isEnabled && isClickable && notLoading) {
          button.click();
          clickCount++;
          console.log(`🖱️ Click #${clickCount}`);
        } else {
          // Log lý do không click (debug)
          if (!isEnabled) console.log("⏸️ Nút đang disabled - chờ server...");
          if (!isClickable) console.log("⏸️ Nút đang p-disabled");
          if (!isVisible) console.log("⏸️ Nút không hiển thị");
          if (!notLoading) console.log("⏸️ Nút đang loading");
        }
      }

      // Update UI mỗi 1 giây
      if (clickCount % 20 === 0) {
        // 20 clicks * 50ms = 1s
        updateStatusUI("RUNNING");
      }
    } catch (err) {
      console.error("❌ Lỗi trong autoClicker:", err);
      isSpamming = false;
      updateStatusUI("ERROR", err.message);
    }
  }

  // ================= KHỞI ĐỘNG =================
  setInterval(autoClicker, CONFIG.clickInterval);

  console.log(`
    ╔════════════════════════════════════════╗
    ║  🎓 AUTO REGISTER TOOL v5.0 READY     ║
    ╠════════════════════════════════════════╣
    ║  ⌨️  Ctrl + M : Bật/Tắt tool          ║
    ║  ✅ Tự động dừng khi thành công       ║
    ║  ⏱️  Timeout: ${CONFIG.maxRuntime / 1000}s              ║
    ╚════════════════════════════════════════╝
    `);
})();
