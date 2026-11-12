def checksum(s: str) -> int:
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h

def validate(key: str, product: str, expected: int) -> bool:
    return checksum(f"{key}:{product}:enterprise-v4") == expected
