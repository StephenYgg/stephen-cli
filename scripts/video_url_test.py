#!/usr/bin/env python3
"""Run a generic stephen video sniff/download test for a supplied URL."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any


def run_command(args: list[str], timeout: int) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            check=False,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError as error:
        return {
            "args": args,
            "exitCode": 127,
            "stdout": "",
            "stderr": str(error),
            "json": None,
        }
    except subprocess.TimeoutExpired as error:
        return {
            "args": args,
            "exitCode": 124,
            "stdout": error.stdout or "",
            "stderr": error.stderr or f"Command timed out after {timeout}s.",
            "json": None,
        }

    stdout = completed.stdout.strip()
    parsed_json = None
    if stdout:
        try:
            parsed_json = json.loads(stdout)
        except json.JSONDecodeError:
            parsed_json = None

    return {
        "args": args,
        "exitCode": completed.returncode,
        "stdout": stdout,
        "stderr": completed.stderr.strip(),
        "json": parsed_json,
    }


def candidate_count(sniff_json: Any) -> int:
    if not isinstance(sniff_json, dict):
        return 0

    candidates = sniff_json.get("candidates")
    if isinstance(candidates, list):
        return len(candidates)

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Analyze a URL with `stephen video sniff`; optionally download it.",
    )
    parser.add_argument("url", help="Page URL, m3u8 URL, or mp4 URL to test.")
    parser.add_argument(
        "--download",
        action="store_true",
        help="Run `stephen video download` after sniffing.",
    )
    parser.add_argument(
        "--mode",
        choices=("auto", "browser", "http"),
        default="auto",
        help="Sniff mode passed to stephen.",
    )
    parser.add_argument(
        "--output-dir",
        help="Output directory passed to `stephen video download`.",
    )
    parser.add_argument(
        "--stephen-bin",
        default="stephen",
        help="Command name or path for the stephen executable.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="Per-command timeout in seconds.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    sniff_args = [
        args.stephen_bin,
        "video",
        "sniff",
        args.url,
        "--mode",
        args.mode,
        "--format",
        "json",
    ]
    sniff = run_command(sniff_args, args.timeout)

    download = None
    if args.download:
        download_args = [
            args.stephen_bin,
            "video",
            "download",
            args.url,
            "--mode",
            args.mode,
            "--format",
            "json",
        ]
        if args.output_dir:
            download_args.extend(["--output-dir", args.output_dir])
        download = run_command(download_args, args.timeout)

    report = {
        "testedAt": datetime.now(timezone.utc).isoformat(),
        "url": args.url,
        "mode": args.mode,
        "candidateCount": candidate_count(sniff["json"]),
        "sniff": sniff,
        "download": download,
    }

    print(json.dumps(report, ensure_ascii=False, indent=2))

    if sniff["exitCode"] != 0:
        return sniff["exitCode"]
    if download is not None and download["exitCode"] != 0:
        return download["exitCode"]
    return 0


if __name__ == "__main__":
    sys.exit(main())
