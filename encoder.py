#!/usr/bin/env python3
"""人员日期编码核心 — 独立可运行的参考实现"""

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"
BASE = 64

def to_b64(n: int) -> str:
    if n == 0:
        return ALPHABET[0]
    chars = []
    while n > 0:
        chars.append(ALPHABET[n % BASE])
        n //= BASE
    return "".join(reversed(chars))

def from_b64(s: str) -> int:
    n = 0
    for ch in s:
        idx = ALPHABET.find(ch)
        if idx == -1:
            raise ValueError(f"非法字符: '{ch}'")
        n = n * BASE + idx
    return n

def md2int(month: int, day: int) -> int:
    return (month - 1) * 31 + (day - 1)

def int2md(v: int) -> tuple[int, int]:
    return v // 31 + 1, v % 31 + 1

def encode(emp_idx: int, month: int, day: int) -> str:
    return to_b64(emp_idx * 372 + md2int(month, day))

def decode(code: str) -> tuple[int, int, int]:
    n = from_b64(code)
    emp_idx = n // 372
    month, day = int2md(n % 372)
    return emp_idx, month, day

if __name__ == "__main__":
    employees = [
        "韩东昊","代志刚","张晓飞","刘晓鹏","吕培高","王新飞","张波","赵天良",
        "战为超","李忠俊","张春辉","徐俊强","赵华","刘益飞","常国辉","郭海洋",
        "刘成双","李沛桢","唐言鹏","刘壮","张倡盛","姜兴志","任玉亭","张伟涛",
        "李宁","刘恩骏","于英","李立娟","高晨翔","封景隆","杨鹏斐","李崇茂",
        "杨宜林","刘博","姜振涛","周海燕","谷美灵",
    ]
    
    # 编码测试
    print("=== 编码 ===")
    cases = [(0, 1, 1), (0, 7, 29), (28, 7, 29), (36, 12, 31)]
    for ei, m, d in cases:
        code = encode(ei, m, d)
        print(f"  {employees[ei]} {m}月{d}日 → {code} ({len(code)}字符)")

    # 解码测试
    print("\n=== 解码 ===")
    for code in ["0", "3M", "2gO", "3N3"]:
        ei, m, d = decode(code)
        print(f"  {code} → {employees[ei]} {m}月{d}日")

    # 循环验证
    print("\n=== 全量验证 ===")
    for ei in range(len(employees)):
        for m in range(1, 13):
            for d in range(1, 32):
                code = encode(ei, m, d)
                e2, m2, d2 = decode(code)
                assert (e2, m2, d2) == (ei, m, d), f"FAIL: {ei},{m},{d}"
    print("  ✅ 37人×372组合 = 13764条全部通过")
