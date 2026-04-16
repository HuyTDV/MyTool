import win32gui
import win32con
import win32api
import math
import time

# ==========================================
# THÔNG SỐ ĐÃ CHỐT CỦA ANH
# ==========================================
SCALE = 1.4  # Kích thước hình vô cực
RUN_SPEED = 0.1  # Tốc độ trượt lững lờ cực chậm
FPS = 30  # Giới hạn 30 khung hình/giây để tiết kiệm CPU
PATH_PRECISION = 2000  # Độ mịn của đường đua
# ==========================================


class DesktopAPI:
    @staticmethod
    def get_listview():
        h_progman = win32gui.FindWindow("Progman", None)
        win32gui.SendMessageTimeout(h_progman, 0x052C, 0, 0, win32con.SMTO_NORMAL, 1000)
        possible_listviews = []
        h_shelldll = win32gui.FindWindowEx(h_progman, 0, "SHELLDLL_DefView", None)
        if h_shelldll:
            h_lv = win32gui.FindWindowEx(h_shelldll, 0, "SysListView32", None)
            if h_lv:
                possible_listviews.append(h_lv)

        h_workerw = 0
        while True:
            h_workerw = win32gui.FindWindowEx(
                win32gui.GetDesktopWindow(), h_workerw, "WorkerW", None
            )
            if not h_workerw:
                break
            h_shelldll = win32gui.FindWindowEx(h_workerw, 0, "SHELLDLL_DefView", None)
            if h_shelldll:
                h_lv = win32gui.FindWindowEx(h_shelldll, 0, "SysListView32", None)
                if h_lv:
                    possible_listviews.append(h_lv)

        for lv in possible_listviews:
            if win32gui.SendMessage(lv, 0x1004, 0, 0) > 0:
                return lv
        return possible_listviews[0] if possible_listviews else None

    @staticmethod
    def get_positions(h_listview):
        positions = []
        if not h_listview:
            return positions
        count = win32gui.SendMessage(h_listview, 0x1004, 0, 0)
        for i in range(count):
            pos = win32gui.SendMessage(h_listview, 0x1010, i, 0)
            positions.append({"x": win32api.LOWORD(pos), "y": win32api.HIWORD(pos)})
        return positions

    @staticmethod
    def set_positions(h_listview, positions):
        if not h_listview:
            return
        for i, pos in enumerate(positions):
            lparam = win32api.MAKELONG(int(pos["x"]), int(pos["y"]))
            win32gui.SendMessage(h_listview, 0x100F, i, lparam)


def distribute_points_evenly(points, num_final_points):
    """Rải điểm đều đặn (Thuật toán giữ nguyên)"""
    distances = [0.0]
    total_length = 0.0
    for i in range(1, len(points)):
        p1, p2 = points[i - 1], points[i]
        dist = math.hypot(p2["x"] - p1["x"], p2["y"] - p1["y"])
        total_length += dist
        distances.append(total_length)

    if total_length == 0:
        return points[:num_final_points]
    target_dist = total_length / (num_final_points - 1) if num_final_points > 1 else 0

    new_points = [points[0]]
    current_dist_needed = target_dist
    for i in range(1, len(points)):
        dist_p1, dist_p2 = distances[i - 1], distances[i]
        while dist_p1 <= current_dist_needed < dist_p2:
            ratio = (current_dist_needed - dist_p1) / (dist_p2 - dist_p1)
            p1, p2 = points[i - 1], points[i]
            new_points.append(
                {
                    "x": p1["x"] + ratio * (p2["x"] - p1["x"]),
                    "y": p1["y"] + ratio * (p2["y"] - p1["y"]),
                }
            )
            if len(new_points) == num_final_points:
                return new_points
            current_dist_needed += target_dist
    while len(new_points) < num_final_points:
        new_points.append(points[-1])
    return new_points


def build_cached_path(cx, cy):
    """TÍNH TOÁN TRƯỚC: Tính sẵn đường đua để CPU không phải làm việc lúc chạy"""
    raw_points = []
    a = 250 * SCALE
    for i in range(PATH_PRECISION):
        t = (2 * math.pi * i) / PATH_PRECISION
        x = (a * math.sqrt(2) * math.cos(t)) / (math.sin(t) ** 2 + 1)
        y = (a * math.sqrt(2) * math.cos(t) * math.sin(t)) / (math.sin(t) ** 2 + 1)
        raw_points.append({"x": cx + x, "y": cy - y})
    return distribute_points_evenly(raw_points, PATH_PRECISION)


def main():
    h_listview = DesktopAPI.get_listview()
    if not h_listview:
        return

    initial_pos = DesktopAPI.get_positions(h_listview)
    num_icons = len(initial_pos)
    if num_icons == 0:
        return

    # Lấy tâm màn hình
    sw, sh = win32api.GetSystemMetrics(0), win32api.GetSystemMetrics(1)
    cx, cy = sw // 2, sh // 2

    # TÍNH TOÁN TRƯỚC LỘ TRÌNH 1 LẦN DUY NHẤT
    cached_path = build_cached_path(cx, cy)
    spacing = PATH_PRECISION / num_icons

    # Ép icon nhảy vào form vô cực
    start_pos = distribute_points_evenly(cached_path, num_icons)
    DesktopAPI.set_positions(h_listview, start_pos)

    # Đợi 2.5s rồi mới lăn bánh
    time.sleep(2.5)
    start_time = time.time()

    # VÒNG LẶP CHẠY NGẦM SIÊU NHẸ
    while True:
        run_time = time.time() - start_time
        new_render_pos = []

        # Chỉ việc Tra cứu tọa độ (Index lookup), không tốn CPU tính toán
        base_offset = run_time * RUN_SPEED * 40
        for i in range(num_icons):
            point_index = int((base_offset + i * spacing)) % PATH_PRECISION
            new_render_pos.append(cached_path[point_index])

        DesktopAPI.set_positions(h_listview, new_render_pos)
        time.sleep(1 / FPS)


if __name__ == "__main__":
    main()
