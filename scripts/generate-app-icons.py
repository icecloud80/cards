#!/usr/bin/env python3

"""
作用：
生成 `找朋友升级` 的 iOS / Android App Icon 全套资源。

为什么这样写：
App Icon 既要保证 iOS 的单张 1024 图标足够精致，也要兼顾 Android legacy icon 与 adaptive icon 的差异；
把母稿生成逻辑收敛到一份脚本里，后续如果需要改颜色、造型或补更多尺寸，可以一次改动统一产出，避免双端资源继续手工漂移。

输入：
@param {void} - 直接使用脚本内维护的资源路径、尺寸映射和品牌配色。

输出：
@returns {void} 在仓库内写出 iOS 图标、Android mipmap 图标、adaptive foreground、预览图和相关背景资源。

注意：
- Android adaptive foreground 必须控制在安全区域内，避免被不同厂商遮罩切掉主体。
- iOS 图标不应带透明圆角，系统会自行裁切；legacy round icon 则需要主动裁成圆形透明边。
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT_DIR = Path(__file__).resolve().parents[1]
IOS_ICON_PATH = ROOT_DIR / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
ICON_PREVIEW_PATH = ROOT_DIR / "images/icons/app_icon_preview.png"

ANDROID_LEGACY_ICON_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

ANDROID_FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

CARD_BG_TOP = (255, 124, 132, 255)
CARD_BG_BOTTOM = (155, 19, 44, 255)
CARD_BG_GLOW = (255, 197, 184, 255)
NAVY_CARD = (29, 51, 95, 255)
NAVY_CARD_ACCENT = (65, 92, 151, 255)
IVORY_CARD = (248, 239, 227, 255)
IVORY_CARD_SHADE = (229, 212, 189, 255)
GOLD_LIGHT = (255, 223, 141, 255)
GOLD_MID = (241, 185, 77, 255)
GOLD_DARK = (162, 99, 29, 255)
RUBY = (204, 68, 58, 255)
RUBY_DEEP = (144, 31, 24, 255)
INK = (33, 29, 36, 255)

if hasattr(Image, "Resampling"):
    RESAMPLE_LANCZOS = Image.Resampling.LANCZOS
    RESAMPLE_BICUBIC = Image.Resampling.BICUBIC
else:
    RESAMPLE_LANCZOS = Image.LANCZOS
    RESAMPLE_BICUBIC = Image.BICUBIC


def mix_color(start_color: tuple[int, int, int, int], end_color: tuple[int, int, int, int], ratio: float) -> tuple[int, int, int, int]:
    """
    作用：
    按比例混合两组 RGBA 颜色。
    
    为什么这样写：
    这份图标大量依赖渐变、描边和高光过渡；
    抽成统一的颜色混合函数后，背景、徽章、卡牌层都能复用同一套插值口径，减少手写颜色常量的割裂感。
    
    输入：
    @param {tuple[int, int, int, int]} start_color - 渐变起点颜色。
    @param {tuple[int, int, int, int]} end_color - 渐变终点颜色。
    @param {float} ratio - `0-1` 区间的混合比例。
    
    输出：
    @returns {tuple[int, int, int, int]} 混合后的 RGBA 颜色。
    
    注意：
    - 比例会被限制在 `0-1`，避免未来调用方传入越界值时出现异常颜色。
    - 返回值保留 alpha，方便直接用于半透明高光与阴影层。
    """

    clamped_ratio = max(0.0, min(1.0, ratio))
    return tuple(
        int(round(start_color[index] + (end_color[index] - start_color[index]) * clamped_ratio))
        for index in range(4)
    )


def create_linear_gradient(width: int, height: int, top_color: tuple[int, int, int, int], bottom_color: tuple[int, int, int, int]) -> Image.Image:
    """
    作用：
    生成纵向线性渐变底图。
    
    为什么这样写：
    App 图标如果直接使用纯色，会在 iOS 和 Android 主屏上显得偏平；
    用纵向渐变先建立主色层，再叠加光晕与纹理，能在小尺寸下保留更稳定的层次感。
    
    输入：
    @param {int} width - 输出图像宽度。
    @param {int} height - 输出图像高度。
    @param {tuple[int, int, int, int]} top_color - 顶部颜色。
    @param {tuple[int, int, int, int]} bottom_color - 底部颜色。
    
    输出：
    @returns {Image.Image} RGBA 渐变图像。
    
    注意：
    - 这里按 y 轴逐行插值，优先保证颜色过渡稳定，不追求极限性能。
    - 渐变图只负责大色块，不在这里直接引入卡牌或徽章细节。
    """

    gradient = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(gradient)
    safe_height = max(1, height - 1)

    for y_position in range(height):
        ratio = y_position / safe_height
        draw.line([(0, y_position), (width, y_position)], fill=mix_color(top_color, bottom_color, ratio))

    return gradient


def create_radial_glow(width: int, height: int, center_x: float, center_y: float, radius: float, color: tuple[int, int, int, int]) -> Image.Image:
    """
    作用：
    创建一层柔和的径向光晕。
    
    为什么这样写：
    单靠线性渐变会让图标中心偏闷；
    径向光晕可以把视觉焦点压到图标主体附近，同时让亮红配色更像有体积感的玻璃釉面，而不是单纯平涂。
    
    输入：
    @param {int} width - 光晕图宽度。
    @param {int} height - 光晕图高度。
    @param {float} center_x - 光晕中心横坐标。
    @param {float} center_y - 光晕中心纵坐标。
    @param {float} radius - 光晕主要作用半径。
    @param {tuple[int, int, int, int]} color - 光晕主色。
    
    输出：
    @returns {Image.Image} 可叠加的 RGBA 光晕图层。
    
    注意：
    - 半径越大越柔和，但也越容易把背景冲灰，因此这里会额外做指数衰减。
    - alpha 会跟随距离衰减，避免出现硬边。
    """

    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    pixels = glow.load()
    safe_radius = max(1.0, radius)

    for x_position in range(width):
        for y_position in range(height):
            dx = x_position - center_x
            dy = y_position - center_y
            distance_ratio = math.sqrt(dx * dx + dy * dy) / safe_radius
            if distance_ratio >= 1.0:
                continue

            opacity_ratio = (1.0 - distance_ratio) ** 2.4
            pixels[x_position, y_position] = (
                color[0],
                color[1],
                color[2],
                int(round(color[3] * opacity_ratio)),
            )

    return glow


def create_rounded_mask(size: int, radius: int) -> Image.Image:
    """
    作用：
    生成圆角遮罩。
    
    为什么这样写：
    iOS legacy 预览图、Android legacy icon 与设计预览都要复用同一张底图；
    把圆角裁切独立出来后，可以在“保留方形母稿”和“导出圆角版本”之间自由切换。
    
    输入：
    @param {int} size - 遮罩边长。
    @param {int} radius - 圆角半径。
    
    输出：
    @returns {Image.Image} L 模式圆角遮罩。
    
    注意：
    - iOS 最终图标不会直接写透明圆角，但预览与 Android legacy 版本需要使用该遮罩。
    - 半径不应超过边长一半，调用方需自行保证。
    """

    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw_rounded_rectangle(draw, (0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_rounded_rectangle(
    draw: ImageDraw.ImageDraw,
    bounds: tuple[float, float, float, float],
    radius: float,
    fill: tuple[int, int, int, int] | int | None = None,
    outline: tuple[int, int, int, int] | int | None = None,
    width: int = 1,
) -> None:
    """
    作用：
    在旧版 Pillow 上兼容绘制圆角矩形。
    
    为什么这样写：
    当前环境里的 Pillow 不保证提供 `rounded_rectangle`；
    加一层兼容封装后，脚本既能在新版本直接走原生 API，也能在旧版本通过矩形与圆角拼接保持相同的出图结构。
    
    输入：
    @param {ImageDraw.ImageDraw} draw - 目标绘制句柄。
    @param {tuple[float, float, float, float]} bounds - 矩形边界。
    @param {float} radius - 圆角半径。
    @param {tuple[int, int, int, int] | int | None} fill - 填充色。
    @param {tuple[int, int, int, int] | int | None} outline - 描边色。
    @param {int} width - 描边宽度。
    
    输出：
    @returns {None} 直接在目标图层上绘制。
    
    注意：
    - 兼容分支会通过多次绘制拼接圆角，优先保证正确性而不是最少调用次数。
    - 半径必须受边界尺寸限制，避免出现负尺寸圆角。
    """

    if hasattr(draw, "rounded_rectangle"):
        draw.rounded_rectangle(bounds, radius=radius, fill=fill, outline=outline, width=width)
        return

    left, top, right, bottom = bounds
    clamped_radius = max(0, min(radius, (right - left) / 2, (bottom - top) / 2))

    if fill is not None:
        draw.rectangle((left + clamped_radius, top, right - clamped_radius, bottom), fill=fill)
        draw.rectangle((left, top + clamped_radius, right, bottom - clamped_radius), fill=fill)
        draw.pieslice((left, top, left + clamped_radius * 2, top + clamped_radius * 2), 180, 270, fill=fill)
        draw.pieslice((right - clamped_radius * 2, top, right, top + clamped_radius * 2), 270, 360, fill=fill)
        draw.pieslice((left, bottom - clamped_radius * 2, left + clamped_radius * 2, bottom), 90, 180, fill=fill)
        draw.pieslice((right - clamped_radius * 2, bottom - clamped_radius * 2, right, bottom), 0, 90, fill=fill)

    if outline is not None and width > 0:
        for step_index in range(width):
            outline_left = left + step_index
            outline_top = top + step_index
            outline_right = right - step_index
            outline_bottom = bottom - step_index
            outline_radius = max(0, clamped_radius - step_index)

            if outline_radius <= 0:
                draw.rectangle((outline_left, outline_top, outline_right, outline_bottom), outline=outline)
                continue

            draw.arc(
                (outline_left, outline_top, outline_left + outline_radius * 2, outline_top + outline_radius * 2),
                180,
                270,
                fill=outline,
            )
            draw.arc(
                (outline_right - outline_radius * 2, outline_top, outline_right, outline_top + outline_radius * 2),
                270,
                360,
                fill=outline,
            )
            draw.arc(
                (outline_left, outline_bottom - outline_radius * 2, outline_left + outline_radius * 2, outline_bottom),
                90,
                180,
                fill=outline,
            )
            draw.arc(
                (outline_right - outline_radius * 2, outline_bottom - outline_radius * 2, outline_right, outline_bottom),
                0,
                90,
                fill=outline,
            )
            draw.line(
                (
                    outline_left + outline_radius,
                    outline_top,
                    outline_right - outline_radius,
                    outline_top,
                ),
                fill=outline,
            )
            draw.line(
                (
                    outline_left + outline_radius,
                    outline_bottom,
                    outline_right - outline_radius,
                    outline_bottom,
                ),
                fill=outline,
            )
            draw.line(
                (
                    outline_left,
                    outline_top + outline_radius,
                    outline_left,
                    outline_bottom - outline_radius,
                ),
                fill=outline,
            )
            draw.line(
                (
                    outline_right,
                    outline_top + outline_radius,
                    outline_right,
                    outline_bottom - outline_radius,
                ),
                fill=outline,
            )


def apply_mask(image: Image.Image, mask: Image.Image) -> Image.Image:
    """
    作用：
    为 RGBA 图像应用指定 alpha 遮罩。
    
    为什么这样写：
    图标导出会同时出现圆角方形与圆形两种裁切形态；
    独立封装遮罩应用逻辑后，后续无论是 legacy round icon 还是文档预览，都能沿用同一套出图方式。
    
    输入：
    @param {Image.Image} image - 待处理的 RGBA 图像。
    @param {Image.Image} mask - L 模式遮罩。
    
    输出：
    @returns {Image.Image} 已叠加 alpha 遮罩的新图像。
    
    注意：
    - 输入图像会先复制，避免直接污染原始母稿。
    - 遮罩尺寸必须与图像一致，否则 Pillow 会报错。
    """

    masked_image = image.copy()
    masked_image.putalpha(mask)
    return masked_image


def create_circle_mask(size: int) -> Image.Image:
    """
    作用：
    生成圆形透明边遮罩。
    
    为什么这样写：
    Android 的 `ic_launcher_round.png` 在部分旧设备与启动器中会直接展示位图本身；
    提前导出一张圆形透明边版本，可以让圆形入口看起来更像专门设计过，而不是简单把方形图硬塞进去。
    
    输入：
    @param {int} size - 遮罩边长。
    
    输出：
    @returns {Image.Image} L 模式圆形遮罩。
    
    注意：
    - 这里不会额外收缩安全边，避免小尺寸下主体进一步变小。
    - 若未来需要更厚的透明边，可在这里统一调整外接圆尺寸。
    """

    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


def add_background_pattern(background: Image.Image) -> Image.Image:
    """
    作用：
    在背景上叠加低对比度的菱形光泽纹理。
    
    为什么这样写：
    这款游戏本身是扑克牌题材，直接把牌花放满背景会显得杂；
    使用轻微的菱形折线纹理，既能借到牌面与徽章的视觉联想，又不会抢走中间卡牌主体的注意力。
    
    输入：
    @param {Image.Image} background - 当前背景底图。
    
    输出：
    @returns {Image.Image} 叠加纹理后的背景。
    
    注意：
    - 纹理 alpha 必须很轻，避免在 Android 小图里出现脏噪点。
    - 这里只叠加线稿，不负责额外的高光或阴影。
    """

    width, height = background.size
    pattern = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(pattern)
    spacing = max(48, width // 7)
    stroke_width = max(2, width // 180)

    for offset in range(-height, width + height, spacing):
        draw.line(
            ((offset, 0), (offset - height, height)),
            fill=(255, 212, 204, 34),
            width=stroke_width,
        )
        draw.line(
            ((offset, 0), (offset + height, height)),
            fill=(255, 255, 255, 18),
            width=stroke_width,
        )

    return Image.alpha_composite(background, pattern)


def create_icon_background(size: int, rounded: bool) -> Image.Image:
    """
    作用：
    生成 App Icon 的亮红背景母稿。
    
    为什么这样写：
    iOS、Android legacy icon 和预览图都需要共用同一套品牌背景；
    先在单独函数里把渐变、光晕、纹理和整体明暗关系统一好，后续替换主体元素时就不会把整张图重新推倒。
    
    输入：
    @param {int} size - 背景边长。
    @param {bool} rounded - 是否导出圆角方形版本。
    
    输出：
    @returns {Image.Image} 完整背景图层。
    
    注意：
    - iOS 最终导出的母稿仍保留方形 alpha，`rounded=True` 主要给预览与 Android legacy 使用。
    - 背景里的高光位置需要围绕主体中心，不要偏得太离谱，否则小尺寸下会显得“亮点飘了”。
    """

    background = create_linear_gradient(size, size, CARD_BG_TOP, CARD_BG_BOTTOM)
    background = add_background_pattern(background)
    background = Image.alpha_composite(
        background,
        create_radial_glow(size, size, size * 0.34, size * 0.24, size * 0.7, (CARD_BG_GLOW[0], CARD_BG_GLOW[1], CARD_BG_GLOW[2], 118)),
    )
    background = Image.alpha_composite(
        background,
        create_radial_glow(size, size, size * 0.68, size * 0.8, size * 0.82, (122, 15, 37, 90)),
    )

    highlight = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    highlight_draw = ImageDraw.Draw(highlight)
    highlight_draw.ellipse(
        (size * 0.1, size * 0.06, size * 0.84, size * 0.48),
        fill=(255, 255, 255, 42),
    )
    background = Image.alpha_composite(background, highlight.filter(ImageFilter.GaussianBlur(radius=size * 0.035)))

    if rounded:
        rounded_mask = create_rounded_mask(size, int(size * 0.24))
        background = apply_mask(background, rounded_mask)

    return background


def create_card_base(width: int, height: int, fill_color: tuple[int, int, int, int], edge_light_color: tuple[int, int, int, int], edge_dark_color: tuple[int, int, int, int]) -> Image.Image:
    """
    作用：
    绘制单张带描边和内层压痕的卡牌底板。
    
    为什么这样写：
    图标主体的核心语言是“叠放的扑克牌”；
    把卡牌底板生成逻辑抽出来后，前景牌、背面牌和未来可能增加的徽章牌都能复用相同的材质风格。
    
    输入：
    @param {int} width - 卡牌宽度。
    @param {int} height - 卡牌高度。
    @param {tuple[int, int, int, int]} fill_color - 卡牌主填充色。
    @param {tuple[int, int, int, int]} edge_light_color - 亮部描边颜色。
    @param {tuple[int, int, int, int]} edge_dark_color - 暗部描边颜色。
    
    输出：
    @returns {Image.Image} RGBA 卡牌底板图像。
    
    注意：
    - 圆角和边距需要按卡牌尺寸同比缩放，避免不同输出尺寸下观感失真。
    - 底板只负责材质层，不在这里塞入具体牌花或升级符号。
    """

    card = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    radius = max(18, width // 8)

    draw_rounded_rectangle(draw, (0, 0, width - 1, height - 1), radius=radius, fill=fill_color)
    draw_rounded_rectangle(
        draw,
        (4, 4, width - 5, height - 5),
        radius=max(14, radius - 6),
        outline=edge_light_color,
        width=max(4, width // 44),
    )
    draw_rounded_rectangle(
        draw,
        (width * 0.07, height * 0.07, width * 0.93, height * 0.93),
        radius=max(12, radius - 18),
        outline=edge_dark_color,
        width=max(2, width // 88),
    )

    top_glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    top_glow_draw = ImageDraw.Draw(top_glow)
    draw_rounded_rectangle(
        top_glow_draw,
        (width * 0.06, height * 0.05, width * 0.94, height * 0.45),
        radius=max(10, radius - 24),
        fill=(255, 255, 255, 30),
    )
    card = Image.alpha_composite(card, top_glow.filter(ImageFilter.GaussianBlur(radius=max(6, width // 36))))

    return card


def draw_suit_diamond(draw: ImageDraw.ImageDraw, center_x: float, center_y: float, size: float, color: tuple[int, int, int, int]) -> None:
    """
    作用：
    绘制菱形牌花。
    
    为什么这样写：
    `找朋友升级` 既是扑克牌游戏，又要保持图标足够简洁；
    用几何菱形表达牌花，比直接塞完整花色字符更稳，也更容易在小尺寸下保持清晰。
    
    输入：
    @param {ImageDraw.ImageDraw} draw - 当前图层的绘制句柄。
    @param {float} center_x - 菱形中心横坐标。
    @param {float} center_y - 菱形中心纵坐标。
    @param {float} size - 菱形半径尺度。
    @param {tuple[int, int, int, int]} color - 菱形颜色。
    
    输出：
    @returns {None} 直接把图形绘制到目标图层。
    
    注意：
    - 这里的 `size` 表示菱形四个顶点到中心的距离，不是外接框尺寸。
    - 不额外加描边，避免小尺寸下菱形内部发脏。
    """

    draw.polygon(
        [
            (center_x, center_y - size),
            (center_x + size, center_y),
            (center_x, center_y + size),
            (center_x - size, center_y),
        ],
        fill=color,
    )


def draw_suit_spade(draw: ImageDraw.ImageDraw, center_x: float, center_y: float, size: float, color: tuple[int, int, int, int]) -> None:
    """
    作用：
    绘制简化黑桃牌花。
    
    为什么这样写：
    背景和主体已经偏暖色，前景牌角上还需要一个深色对比点；
    用简化黑桃做角标，既能加强“扑克牌”识别，也能和红色菱形形成更完整的花色对照。
    
    输入：
    @param {ImageDraw.ImageDraw} draw - 当前图层的绘制句柄。
    @param {float} center_x - 黑桃中心横坐标。
    @param {float} center_y - 黑桃中心纵坐标。
    @param {float} size - 黑桃主体尺度。
    @param {tuple[int, int, int, int]} color - 黑桃颜色。
    
    输出：
    @returns {None} 直接把图形绘制到目标图层。
    
    注意：
    - 黑桃由两个圆叶和一个尖底组成，避免依赖字体渲染。
    - 柄部需要稍微短一些，防止挤占卡牌边角安全区。
    """

    leaf_radius = size * 0.6
    draw.ellipse((center_x - size, center_y - size, center_x, center_y), fill=color)
    draw.ellipse((center_x, center_y - size, center_x + size, center_y), fill=color)
    draw.polygon(
        [
            (center_x - size * 0.95, center_y - size * 0.15),
            (center_x + size * 0.95, center_y - size * 0.15),
            (center_x, center_y + size * 1.25),
        ],
        fill=color,
    )
    draw_rounded_rectangle(
        draw,
        (
            center_x - leaf_radius * 0.28,
            center_y + size * 0.58,
            center_x + leaf_radius * 0.28,
            center_y + size * 1.55,
        ),
        radius=max(1, int(size * 0.12)),
        fill=color,
    )


def draw_suit_heart(draw: ImageDraw.ImageDraw, center_x: float, center_y: float, size: float, color: tuple[int, int, int, int]) -> None:
    """
    作用：
    绘制简化红桃牌花。
    
    为什么这样写：
    用户希望主牌明确回到 `红桃A`；
    用几何方式直接画出红桃，可以避免字体或外部素材依赖，同时保证在小尺寸图标里也能保持标准牌花识别。
    
    输入：
    @param {ImageDraw.ImageDraw} draw - 当前图层的绘制句柄。
    @param {float} center_x - 红桃中心横坐标。
    @param {float} center_y - 红桃中心纵坐标。
    @param {float} size - 红桃主尺度。
    @param {tuple[int, int, int, int]} color - 红桃颜色。
    
    输出：
    @returns {None} 直接把红桃牌花绘制到目标图层。
    
    注意：
    - 叶片和下尖需要略微加宽，避免缩小后看起来像菱形。
    - 这里不额外加描边，避免小尺寸下边缘发脏。
    """

    leaf_radius = size * 0.72
    draw.ellipse(
        (
            center_x - size,
            center_y - leaf_radius,
            center_x,
            center_y + leaf_radius * 0.45,
        ),
        fill=color,
    )
    draw.ellipse(
        (
            center_x,
            center_y - leaf_radius,
            center_x + size,
            center_y + leaf_radius * 0.45,
        ),
        fill=color,
    )
    draw.polygon(
        [
            (center_x - size * 1.08, center_y - size * 0.05),
            (center_x + size * 1.08, center_y - size * 0.05),
            (center_x, center_y + size * 1.45),
        ],
        fill=color,
    )


def draw_letter_a(draw: ImageDraw.ImageDraw, center_x: float, top_y: float, size: float, color: tuple[int, int, int, int]) -> None:
    """
    作用：
    绘制简化的大写字母 `A`。
    
    为什么这样写：
    `红桃A` 的识别不仅来自中间大红桃，也来自角标里的 `A`；
    用几何线条直接画字母，可以避免字体依赖，同时在图标缩放后继续保持清晰。
    
    输入：
    @param {ImageDraw.ImageDraw} draw - 当前图层的绘制句柄。
    @param {float} center_x - 字母中心横坐标。
    @param {float} top_y - 字母顶部纵坐标。
    @param {float} size - 字母高度。
    @param {tuple[int, int, int, int]} color - 字母颜色。
    
    输出：
    @returns {None} 直接把字母 `A` 绘制到目标图层。
    
    注意：
    - 横杠需要略粗，避免缩小后看不出是 `A`。
    - 字母整体不宜过宽，避免和下方红桃挤在一起。
    """

    stroke_width = max(2, int(size * 0.16))
    baseline_y = top_y + size
    crossbar_y = top_y + size * 0.56

    draw.line(
        [
            (center_x - size * 0.42, baseline_y),
            (center_x, top_y),
            (center_x + size * 0.42, baseline_y),
        ],
        fill=color,
        width=stroke_width,
    )
    draw.line(
        [
            (center_x - size * 0.18, crossbar_y),
            (center_x + size * 0.18, crossbar_y),
        ],
        fill=color,
        width=stroke_width,
    )


def draw_ace_corner_mark(
    draw: ImageDraw.ImageDraw,
    center_x: float,
    top_y: float,
    size: float,
    color: tuple[int, int, int, int],
) -> None:
    """
    作用：
    绘制 `红桃A` 角标组合。
    
    为什么这样写：
    单独只有中间大红桃还不够像标准 A 牌；
    用 `A + 小红桃` 的竖向组合把角标锁住后，主牌在缩略尺寸下也能更像真实扑克牌面。
    
    输入：
    @param {ImageDraw.ImageDraw} draw - 当前图层的绘制句柄。
    @param {float} center_x - 角标中心横坐标。
    @param {float} top_y - 角标顶部纵坐标。
    @param {float} size - 角标主要高度。
    @param {tuple[int, int, int, int]} color - 角标颜色。
    
    输出：
    @returns {None} 直接把角标绘制到目标图层。
    
    注意：
    - 角标要控制在牌角安全区内，避免和圆角描边打架。
    - 下方的小红桃需要比字母明显更小，否则会喧宾夺主。
    """

    draw_letter_a(draw, center_x, top_y, size * 0.54, color)
    draw_suit_heart(draw, center_x, top_y + size * 0.78, size * 0.18, color)


def create_back_card(width: int, height: int) -> Image.Image:
    """
    作用：
    创建位于后方的深色牌背。
    
    为什么这样写：
    图标主体如果只有一张前景牌会偏单薄；
    增加一张深蓝牌背可以把“叠牌”层次立起来，同时用冷暖对比托住前景牌，提升精致感。
    
    输入：
    @param {int} width - 牌背宽度。
    @param {int} height - 牌背高度。
    
    输出：
    @returns {Image.Image} RGBA 牌背图像。
    
    注意：
    - 牌背只做轻量装饰，不要比前景牌更抢眼。
    - 中间纹样必须足够简单，避免旋转后产生密集噪点。
    """

    card = create_card_base(width, height, NAVY_CARD, GOLD_LIGHT, NAVY_CARD_ACCENT)
    draw = ImageDraw.Draw(card)
    inset_left = width * 0.17
    inset_top = height * 0.17
    inset_right = width * 0.83
    inset_bottom = height * 0.83
    accent_width = max(3, width // 42)

    draw_rounded_rectangle(
        draw,
        (inset_left, inset_top, inset_right, inset_bottom),
        radius=max(12, width // 10),
        outline=(255, 255, 255, 42),
        width=accent_width,
    )

    center_x = width / 2
    center_y = height / 2
    motif_radius = width * 0.12
    draw_suit_diamond(draw, center_x, center_y - motif_radius * 0.85, motif_radius, GOLD_MID)
    draw_suit_diamond(draw, center_x, center_y + motif_radius * 0.85, motif_radius, GOLD_MID)
    draw.line(
        [(center_x, center_y - motif_radius * 0.2), (center_x, center_y + motif_radius * 0.2)],
        fill=GOLD_LIGHT,
        width=max(4, width // 34),
    )

    for ratio in (0.24, 0.76):
        draw_suit_diamond(draw, width * ratio, height * 0.2, width * 0.03, GOLD_LIGHT)
        draw_suit_diamond(draw, width * ratio, height * 0.8, width * 0.03, GOLD_LIGHT)

    return card


def create_front_card(width: int, height: int) -> Image.Image:
    """
    作用：
    创建位于最前方的主牌图层。
    
    为什么这样写：
    这张牌既是“扑克牌”识别锚点，也是这次 `红桃A` 调整的主承载面；
    使用偏暖的象牙色底板，可以在亮红背景和蓝色牌背之间形成稳定对比，同时保留经典纸牌质感。
    
    输入：
    @param {int} width - 主牌宽度。
    @param {int} height - 主牌高度。
    
    输出：
    @returns {Image.Image} RGBA 主牌图像。
    
    注意：
    - 角标要优先服务 `红桃A` 识别，不再继续沿用上一版的大王帽样式。
    - 中间红桃要足够大，缩小成 App Icon 后仍能第一眼认出来。
    """

    card = create_card_base(width, height, IVORY_CARD, (255, 255, 255, 255), IVORY_CARD_SHADE)
    draw = ImageDraw.Draw(card)

    corner_inset_x = width * 0.17
    corner_inset_y = height * 0.15
    corner_mark_size = width * 0.2
    draw_ace_corner_mark(draw, corner_inset_x, corner_inset_y - width * 0.015, corner_mark_size, RUBY)
    draw_ace_corner_mark(
        draw,
        width - corner_inset_x,
        height - corner_inset_y - width * 0.17,
        corner_mark_size,
        RUBY,
    )

    center_heart_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    center_heart_draw = ImageDraw.Draw(center_heart_layer)
    draw_suit_heart(center_heart_draw, width / 2, height * 0.47, width * 0.15, RUBY)
    heart_shadow = center_heart_layer.filter(ImageFilter.GaussianBlur(radius=max(4, width // 42)))
    shadow_mask = heart_shadow.getchannel("A").point(lambda alpha_value: int(alpha_value * 0.3))
    heart_shadow.putalpha(shadow_mask)
    card = Image.alpha_composite(card, heart_shadow)
    card = Image.alpha_composite(card, center_heart_layer)

    return card


def add_layer_with_shadow(base_image: Image.Image, layer: Image.Image, position: tuple[int, int], blur_radius: int, shadow_offset: tuple[int, int], shadow_alpha: int) -> Image.Image:
    """
    作用：
    把图层连同柔和投影一起叠加到目标画布。
    
    为什么这样写：
    叠牌图标如果完全没有投影，会缺少厚度；
    统一通过这一层处理阴影，可以让前后牌和徽章元素的空间关系更稳定，也便于控制阴影不要在小尺寸下糊成一团。
    
    输入：
    @param {Image.Image} base_image - 最终画布。
    @param {Image.Image} layer - 需要叠加的图层。
    @param {tuple[int, int]} position - 图层左上角坐标。
    @param {int} blur_radius - 阴影模糊半径。
    @param {tuple[int, int]} shadow_offset - 阴影相对图层的偏移量。
    @param {int} shadow_alpha - 阴影整体透明度。
    
    输出：
    @returns {Image.Image} 叠加完成后的画布。
    
    注意：
    - 图层默认应已带透明背景，否则阴影会形成整块黑边。
    - 阴影 alpha 不宜过高，避免 Android 小图出现脏边。
    """

    shadow = Image.new("RGBA", base_image.size, (0, 0, 0, 0))
    shadow_layer = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    shadow_alpha_mask = layer.getchannel("A").point(lambda alpha_value: int(alpha_value * shadow_alpha / 255))
    shadow_layer.putalpha(shadow_alpha_mask)
    shadow.paste(shadow_layer, (position[0] + shadow_offset[0], position[1] + shadow_offset[1]), shadow_layer)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=blur_radius))

    composed = Image.alpha_composite(base_image, shadow)
    composed.alpha_composite(layer, position)
    return composed


def rotate_layer(layer: Image.Image, angle: float) -> Image.Image:
    """
    作用：
    以高质量采样旋转图层。
    
    为什么这样写：
    扑克牌图标的精致感很大程度来自轻微错落的角度；
    统一使用带透明扩展的旋转函数，能避免不同元素分别旋转时出现裁切和锯齿不一致的问题。
    
    输入：
    @param {Image.Image} layer - 待旋转图层。
    @param {float} angle - 旋转角度，逆时针为正。
    
    输出：
    @returns {Image.Image} 旋转后的 RGBA 图层。
    
    注意：
    - `expand=True` 是必须项，否则图层边缘会被直接截断。
    - 角度不宜过大，避免图标主体显得散。
    """

    return layer.rotate(angle, resample=RESAMPLE_BICUBIC, expand=True)


def create_foreground_art(size: int) -> Image.Image:
    """
    作用：
    生成不含背景的主体图层，用于 Android adaptive foreground 与整体母稿合成。
    
    为什么这样写：
    Android adaptive icon 需要把主体和背景拆开；
    先得到一张纯主体层，就能同时服务 Android foreground 和完整 App Icon 合成，避免两端主体比例悄悄偏掉。
    
    输入：
    @param {int} size - 输出边长。
    
    输出：
    @returns {Image.Image} RGBA 前景主体图像。
    
    注意：
    - 主体必须控制在安全区内，尤其是 adaptive icon。
    - 这里不直接叠背景，保证前景可在多种背景上复用。
    """

    art = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    back_card = rotate_layer(create_back_card(int(size * 0.36), int(size * 0.49)), -15)
    front_card = rotate_layer(create_front_card(int(size * 0.41), int(size * 0.55)), 11)

    art = add_layer_with_shadow(
        art,
        back_card,
        (int(size * 0.18), int(size * 0.17)),
        blur_radius=max(6, int(size * 0.018)),
        shadow_offset=(int(size * 0.012), int(size * 0.02)),
        shadow_alpha=118,
    )
    art = add_layer_with_shadow(
        art,
        front_card,
        (int(size * 0.29), int(size * 0.19)),
        blur_radius=max(6, int(size * 0.024)),
        shadow_offset=(int(size * 0.01), int(size * 0.022)),
        shadow_alpha=140,
    )

    sparkle = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sparkle_draw = ImageDraw.Draw(sparkle)
    center_x = int(size * 0.77)
    center_y = int(size * 0.27)
    sparkle_radius = size * 0.05
    sparkle_draw.polygon(
        [
            (center_x, center_y - sparkle_radius),
            (center_x + sparkle_radius * 0.34, center_y - sparkle_radius * 0.34),
            (center_x + sparkle_radius, center_y),
            (center_x + sparkle_radius * 0.34, center_y + sparkle_radius * 0.34),
            (center_x, center_y + sparkle_radius),
            (center_x - sparkle_radius * 0.34, center_y + sparkle_radius * 0.34),
            (center_x - sparkle_radius, center_y),
            (center_x - sparkle_radius * 0.34, center_y - sparkle_radius * 0.34),
        ],
        fill=(255, 240, 204, 120),
    )
    art = Image.alpha_composite(art, sparkle.filter(ImageFilter.GaussianBlur(radius=max(2, int(size * 0.006)))))

    return art


def create_full_icon(size: int) -> Image.Image:
    """
    作用：
    合成完整的 App Icon 母稿。
    
    为什么这样写：
    iOS 与 Android legacy icon 需要一张已经包含背景与主体的完整图；
    把这一步单独封装后，导出预览、导出 iOS 图标、导出 legacy round icon 都可以沿用同一张母稿做不同裁切。
    
    输入：
    @param {int} size - 图标边长。
    
    输出：
    @returns {Image.Image} 完整 RGBA App Icon。
    
    注意：
    - 这里使用方形背景母稿，圆角或圆形裁切由导出阶段决定。
    - 主体叠加后还会额外补一层轻微整体高光，帮助图标在浅色壁纸上更立体。
    """

    background = create_icon_background(size, rounded=False)
    foreground = create_foreground_art(size)
    full_icon = Image.alpha_composite(background, foreground)

    glaze = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glaze_draw = ImageDraw.Draw(glaze)
    glaze_draw.ellipse((size * 0.08, size * 0.05, size * 0.92, size * 0.48), fill=(255, 255, 255, 24))
    full_icon = Image.alpha_composite(full_icon, glaze.filter(ImageFilter.GaussianBlur(radius=max(10, int(size * 0.03)))))

    return full_icon


def ensure_parent_directory(file_path: Path) -> None:
    """
    作用：
    确保目标文件的父目录存在。
    
    为什么这样写：
    这份脚本会同时写多个资源目录；
    在真正保存前统一兜一层目录创建，可以避免后续新增输出路径时因为目录缺失导致整个脚本中断。
    
    输入：
    @param {Path} file_path - 即将写出的目标文件路径。
    
    输出：
    @returns {None} 若目录不存在则创建。
    
    注意：
    - 使用 `parents=True`，避免未来输出目录层级加深时还要额外处理。
    - `exist_ok=True` 允许重复执行脚本，不把已存在目录视为异常。
    """

    file_path.parent.mkdir(parents=True, exist_ok=True)


def save_png(image: Image.Image, output_path: Path, size: int) -> None:
    """
    作用：
    把图像按指定尺寸缩放并保存为 PNG。
    
    为什么这样写：
    iOS 和 Android 图标都要从统一母稿派生不同尺寸；
    把保存逻辑抽成公共函数后，尺寸变更时只需要改映射表，不必重复手写缩放和目录创建。
    
    输入：
    @param {Image.Image} image - 待保存的源图。
    @param {Path} output_path - 输出文件路径。
    @param {int} size - 目标边长。
    
    输出：
    @returns {None} 缩放并写出 PNG 文件。
    
    注意：
    - 统一使用 `LANCZOS`，确保小尺寸图标边缘尽量平滑。
    - 保存前会自动创建父目录。
    """

    ensure_parent_directory(output_path)
    resized_image = image.resize((size, size), RESAMPLE_LANCZOS)
    resized_image.save(output_path)


def write_ios_icon(full_icon: Image.Image) -> None:
    """
    作用：
    写出 iOS 1024x1024 App Icon 与仓库预览图。
    
    为什么这样写：
    当前 iOS 资产集只维护一张 `1024x1024` 通用图标；
    直接从高分辨率母稿输出一张最终图，既满足提审资源要求，也方便在仓库里保留一张直观预览图。
    
    输入：
    @param {Image.Image} full_icon - 完整 App Icon 母稿。
    
    输出：
    @returns {None} 写出 iOS 图标与预览 PNG。
    
    注意：
    - iOS 图标文件保留完整方形画布，不主动写透明圆角。
    - 预览图则会额外做圆角处理，方便人眼快速检查观感。
    """

    save_png(full_icon, IOS_ICON_PATH, 1024)
    rounded_preview = apply_mask(full_icon.resize((1024, 1024), RESAMPLE_LANCZOS), create_rounded_mask(1024, 246))
    save_png(rounded_preview, ICON_PREVIEW_PATH, 1024)


def write_android_icons(full_icon: Image.Image, foreground_art: Image.Image) -> None:
    """
    作用：
    写出 Android legacy icon、round icon 与 adaptive foreground。
    
    为什么这样写：
    Android 现有壳工程已经同时保留 legacy / round / adaptive 三套路由；
    这一层把三套资源一次写全，避免某一类尺寸漏更后在不同系统版本上出现新旧图标混用。
    
    输入：
    @param {Image.Image} full_icon - 含背景的完整母稿。
    @param {Image.Image} foreground_art - 透明背景的主体图层。
    
    输出：
    @returns {None} 写出 Android 各尺寸 PNG。
    
    注意：
    - `ic_launcher_round.png` 需要主动裁成圆形透明边版本。
    - adaptive foreground 只写主体，不包含底色。
    """

    for density, size in ANDROID_LEGACY_ICON_SIZES.items():
        output_dir = ROOT_DIR / "android/app/src/main/res" / density
        save_png(full_icon, output_dir / "ic_launcher.png", size)
        rounded_icon = apply_mask(
            full_icon.resize((size, size), RESAMPLE_LANCZOS),
            create_circle_mask(size),
        )
        save_png(rounded_icon, output_dir / "ic_launcher_round.png", size)

    for density, size in ANDROID_FOREGROUND_SIZES.items():
        output_dir = ROOT_DIR / "android/app/src/main/res" / density
        save_png(foreground_art, output_dir / "ic_launcher_foreground.png", size)


def main() -> None:
    """
    作用：
    串行执行 App Icon 全量生成流程。
    
    为什么这样写：
    当前仓库的图标输出路径分散在 iOS 与 Android 两套目录；
    用一个明确的主入口统一调度生成步骤，后续无论是本地手工执行、CI 校验还是原生壳同步前的资源刷新，都更容易复用。
    
    输入：
    @param {void} - 依赖脚本内部固定配置。
    
    输出：
    @returns {None} 所有资源写出完成后正常结束。
    
    注意：
    - 先生成高分辨率母稿，再派生小尺寸，避免重复做几何计算。
    - 若未来引入更多平台尺寸，应优先扩展映射表，而不是复制新的导出流程。
    """

    full_icon = create_full_icon(1024)
    foreground_art = create_foreground_art(432)
    write_ios_icon(full_icon)
    write_android_icons(full_icon, foreground_art)


if __name__ == "__main__":
    main()
