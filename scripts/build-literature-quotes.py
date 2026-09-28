"""Build an offline, reproducible whale quote list from the MIT chinese-poetry corpus.

The source revision is pinned. Downloads are cached under ignored data/ and never
included in the Windows package. Each selected paragraph is copied verbatim as
one complete sentence with its author, tune title and source shard.
"""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen
import json
import re
import time


ROOT = Path(__file__).resolve().parent.parent
REVISION = "b8594f81a89752241442f2ce267d6f66f96704ee"
BASE = f"https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/{REVISION}/"
SHARDS = [f"宋词/ci.song.{n}.json" for n in (0, 3000, 6000, 9000, 12000, 15000, 18000, 20000)]
CACHE = ROOT / "data" / "poetry-source"
SEEDS = ROOT / "scripts" / "literature-seeds.json"
OUTPUT = ROOT / "src" / "literature-quotes.js"
TARGET = 1120
LIU_YONG_TARGET = 80
IMAGE_CHARS = set("山水江河湖海溪泉雨雪风云月星日夜春秋花柳梅竹松桂荷兰桃杏雁鹤莺燕鸟蝉鱼舟船帆桥楼亭灯窗烟霜霞露草树叶林沙岸潮渔笛琴香梦影青碧红白")
OVERUSED = ("明月几时有", "人有悲欢离合", "但愿人长久", "衣带渐宽终不悔", "为伊消得人憔悴",
            "执手相看泪眼", "多情自古伤离别", "今宵酒醒何处", "杨柳岸晓风残月", "大江东去",
            "十年生死两茫茫", "众里寻他千百度", "无可奈何花落去", "似曾相识燕归来")
COURT = ("万岁", "圣主", "圣君", "天子", "皇图", "尧舜", "凤辇", "金銮", "奉圣", "万邦",
         "祝寿", "寿星", "寿杯", "寿筵", "寿酒", "生辰", "华堂", "金荷", "金殿", "丹凤",
         "功名", "官柳", "使君", "皇帝", "乃翁", "郡守", "富贵", "宰相", "朝元", "三台",
         "绣衣", "封侯", "国祚", "圣恩", "歌颂", "飞黄", "旌旗", "宴席", "芳樽",
         "鸳被", "云雨", "巫山", "襄王", "妖娆", "粉面", "艳态", "朱户", "金钗")
LITERARY_AUTHORS = set("""柳永 苏轼 辛弃疾 李清照 晏殊 晏几道 欧阳修 秦观 贺铸 周邦彦 姜夔 吴文英 张炎 史达祖 蒋捷 周密 陆游 张孝祥 刘克庄 李之仪 范仲淹 晁补之 毛滂 朱敦儒 赵长卿 叶梦得 王安石 黄庭坚 陈与义 张先 张元干 陈亮 高观国 王沂孙 袁去华 韩元吉 方岳 刘过 张鎡 周紫芝 吴潜 刘辰翁 仇远 李曾伯 李纲 赵彦端 赵师侠 侯置 刘仙伦 陈允平 汪元量 向子諲 石孝友 晁端礼 杜安世 京镗 曹冠 曹勋 李弥逊 万俟咏 朱淑真 岳飞 范成大 杨万里 赵以夫 汪莘 郭应祥 蔡伸 王千秋 卢炳 吴儆 黄公绍 葛郯 张纲 吕渭老 马子严""".split())


def fetch_source(path):
    cached = CACHE / Path(path).name
    if cached.exists():
        return path, json.loads(cached.read_text(encoding="utf-8"))
    url = BASE + quote(path)
    for attempt in range(3):
        try:
            with urlopen(url, timeout=120) as response:
                content = response.read()
            items = json.loads(content.decode("utf-8"))
            cached.write_bytes(content)
            return path, items
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def valid_line(text):
    if not isinstance(text, str):
        return False
    if not 14 <= len(text) <= 38 or not text.endswith(("。", "！", "？")):
        return False
    if re.search(r"[。！？；;\n\r]", text[:-1]) or not 1 <= text.count("，") <= 3:
        return False
    if not re.fullmatch(r"[\u3400-\u9fff，、·・—！？。]+", text):
        return False
    if any(word in text for word in OVERUSED + COURT):
        return False
    return True


def score_line(text):
    images = len(set(text) & IMAGE_CHARS)
    # Prefer visual, concrete sentences of a length that fits the whale bubble.
    return images * 3 + (3 if 18 <= len(text) <= 28 else 0) + (2 if text.count("，") == 1 else 0)


def stable_order(item):
    key = "|".join((item["author"], item["work"], item["text"]))
    return sha256(key.encode("utf-8")).hexdigest()


def candidates_for_poem(path, poem):
    author = poem.get("author", "")
    work = poem.get("rhythmic", "")
    if author not in LITERARY_AUTHORS:
        return None
    if not isinstance(work, str) or not 2 <= len(work) <= 20:
        return None
    # A famous poem can contain less familiar sentences; filter the sentence,
    # rather than discarding every line in a well-known work.
    lines = [line for line in poem.get("paragraphs", []) if valid_line(line)]
    if not lines:
        return None
    line = max(lines, key=lambda text: (score_line(text), sha256(text.encode("utf-8")).hexdigest()))
    return {"text": line, "author": author, "work": work.replace("・", "·"), "source": path}


def select(candidates, seeds):
    seed_texts = {item["text"] for item in seeds}
    deduped = {}
    for item in candidates:
        if item["text"] not in seed_texts:
            deduped.setdefault(item["text"], item)
    ranked = sorted(deduped.values(), key=lambda item: (-score_line(item["text"]), stable_order(item)))
    selected = []
    author_counts = Counter()
    work_counts = Counter()

    def accept(item, author_cap, work_cap):
        author, work = item["author"], item["work"]
        key = (author, work)
        if author_counts[author] >= author_cap or work_counts[key] >= work_cap:
            return False
        selected.append(item)
        author_counts[author] += 1
        work_counts[key] += 1
        return True

    for item in ranked:
        if item["author"] == "柳永" and author_counts["柳永"] < LIU_YONG_TARGET:
            accept(item, LIU_YONG_TARGET, 12)
    if author_counts["柳永"] < 60:
        raise RuntimeError(f"Only {author_counts['柳永']} usable Liu Yong sentences; inspect source/filter")
    for item in ranked:
        if len(selected) >= TARGET:
            break
        if item["author"] != "柳永":
            accept(item, 24, 8)
    if len(selected) < TARGET:
        raise RuntimeError(f"Only {len(selected)} eligible sentences; review shards or filters")
    return sorted(seeds + selected, key=stable_order)


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    seeds = json.loads(SEEDS.read_text(encoding="utf-8"))
    with ThreadPoolExecutor(max_workers=4) as pool:
        source_files = list(pool.map(fetch_source, SHARDS))
    candidates = [candidate for path, poems in source_files
                  for poem in poems if (candidate := candidates_for_poem(path, poem))]
    quotes = select(candidates, seeds)
    rendered = [
        "// 公有领域诗词原文；宋词由 chinese-poetry/chinese-poetry (MIT) 固定版本筛选。",
        f"// 语料版本：{REVISION}；筛选脚本：scripts/build-literature-quotes.py。",
        "// 每条是原文中的完整一句；source 为原始 JSON 分片，出处为作者与词牌/诗题。",
        "window.whaleLiteratureQuotes = Object.freeze([",
    ]
    for item in quotes:
        rendered.append("  " + json.dumps(item, ensure_ascii=False, separators=(",", ":")) + ",")
    rendered.append("])")
    OUTPUT.write_text("\n".join(rendered) + "\n", encoding="utf-8")
    print(json.dumps({"total": len(quotes), "songCi": len(quotes) - len(seeds),
                      "liuYong": sum(item["author"] == "柳永" for item in quotes),
                      "authors": len({item["author"] for item in quotes}),
                      "candidates": len(candidates)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
