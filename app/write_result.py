from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WriteResult:
    value: Any
    revision: int
    committed: bool
