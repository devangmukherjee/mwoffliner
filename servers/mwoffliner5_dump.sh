#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js --verbose --skipHtmlCache --deflateTmpHtml --skipCacheCleaning --adminEmail=kelson@kiwix.org --format= --format=nopic"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --speed=5 --verbose --adminEmail=contact@kiwix.org --mwUrl=https://meta.wikimedia.org/ --skipCacheCleaning"

# Wikipedia in English
$MWOFFLINER --speed=10 --mwUrl="https://en.wikipedia.org/" --parsoidUrl="https://en.wikipedia.org/api/rest_v1/page/html/" --customMainPage="user:Popo_le_Chien/Kiwix" --outputDirectory=$ZIM2INDEX/wikipedia/

