#!/bin/bash

set -e

sudo apt update

sudo apt install -y python3-dev python3-pip cmake build-essential python3-rpi.gpio
sudo apt install -y libatlas-base-dev libjpeg-dev libpng-dev
sudo apt install -y libavcodec-dev libavformat-dev libswscale-dev
sudo apt install -y ffmpeg
sudo apt install -y libasound-dev portaudio19-dev
sudo apt install -y wget unzip

python3 -m venv . --system-site-packages

source bin/activate

pip3 install --upgrade pip

pip3 install -r requirements.txt

mkdir -p videos models replay_buffers requisites 

if [ ! -f simple_facerec.py ]; then
    wget -q https://raw.githubusercontent.com/computervisioneng/simple-facerec/main/simple_facerec.py
fi

if [ ! -f requisites/detect.tflite ]; then
    wget -q https://storage.googleapis.com/download.tensorflow.org/models/tflite/coco_ssd_mobilenet_v1_1.0_quant_2018_06_29.zip -O model_temp.zip
    unzip -q model_temp.zip -d model_temp
    mv model_temp/* models/
    rm -rf model_temp model_temp.zip
fi


echo "Installation complete"

