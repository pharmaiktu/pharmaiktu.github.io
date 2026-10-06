"""Yayın ayarları — GitHub Actions bu dosyayla derler."""
import os
import sys

sys.path.append(os.curdir)
from pelicanconf import *  # noqa: E402,F401,F403

SITEURL = "https://pharmaiktu.github.io"
MAIN_SITEURL = SITEURL
RELATIVE_URLS = False
DELETE_OUTPUT_DIRECTORY = True
