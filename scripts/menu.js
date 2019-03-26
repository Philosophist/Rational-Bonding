/* global AFRAME */
'use strict';

const dict=[

 {name : "Original", file: "PIA15482.jpg"},
 {name : "Aquarium", file: "IMG_Aquarium_20190323_172712_processed.jpg"},
 {name : "Archer", file: "IMG_Archer_20190323_171500_processed.jpg"},
 {name : "Baobab", file: "IMG_Baobab_20190323_170953_processed.jpg"},
 {name : "cat", file: "IMG_Bengal_cat_20190323_154851_processed.jpg"},
 {name : "Broadway", file: "IMG_Broadway_20190323_155114_processed.jpg"},
 {name : "Bus", file: "IMG_Bus_20190323_171142_processed.jpg"},
 {name : "Butterfly", file: "IMG_Butterfly_20190323_172215_processed.jpg"},
 {name : "Chess", file: "IMG_Chess_20190323_163833_processed.jpg"},
 {name : "Colibri", file: "IMG_Colibri_20190323_164802_processed.jpg"},
 {name : "Coloured", file: "IMG_Coloured_20190323_165636_processed.jpg"},
 {name : "Constellation", file: "IMG_Constellation_20190323_172928_processed.jpg"},
 {name : "Crowd", file: "IMG_Crowd_20190323_163844_processed.jpg"},
 {name : "Crystal", file: "IMG_Crystal_20190323_165614_processed.jpg"},
 {name : "Curly Hair", file: "IMG_Curly_Hair_20190323_155326_processed.jpg"},
 {name : "Daryl Feril", file: "IMG_Daryl_Feril_20190323_155131_processed.jpg"},
 {name : "Diver", file: "IMG_Diver_20190323_172642_processed.jpg"},
 {name : "Donuts", file: "IMG_Donuts_20190323_163913_processed.jpg"},
 {name : "Dragon", file: "IMG_Dragon_20190323_165037_processed.jpg"},
 {name : "Farm", file: "IMG_Farm_20190323_155038_processed.jpg"},
 {name : "Fire", file: "IMG_Fire_20190323_172325_processed.jpg"},
 {name : "Glaze", file: "IMG_Glaze_20190323_161235_processed.jpg"},
 {name : "Heisenberg", file: "IMG_Heisenberg_20190323_155021_processed.jpg"},
 {name : "Hills", file: "IMG_Hills_20190323_164205_processed.jpg"},
 {name : "HiAI", file: "IMG_Huawei_HiAI_20190323_173728_processed.jpg"},
 {name : "Rink", file: "IMG_Ice_Rink_20190323_160802_processed.jpg"},
 {name : "Island", file: "IMG_Island_20190323_165835_processed.jpg"},
 {name : "Jellyfish", file: "IMG_Jellyfish_20190323_165759_processed.jpg"},
 {name : "Journey", file: "IMG_Journey_20190323_155440_processed.jpg"},
 {name : "Latte", file: "IMG_Latte_20190323_172536_processed.jpg"},
 {name : "Lobster", file: "IMG_Lobster_20190323_173711_processed.jpg"},
 {name : "wand", file: "IMG_Magic_wand_20190323_161516_processed.jpg"},
 {name : "space", file: "IMG_Man_in_space_20190323_170829_processed.jpg"},
 {name : "Mosaic", file: "IMG_Mosaic_20190323_173813_processed.jpg"},
 {name : "Paris", file: "IMG_Paris_20190323_164233_processed.jpg"},
 {name : "Peony", file: "IMG_Peony_20190323_171848_processed.jpg"},
 {name : "Pool", file: "IMG_Pool_20190323_172900_processed.jpg"},
 {name : "Roll", file: "IMG_Rock_and_Roll_20190323_155212_processed.jpg"},
 {name : "Sailor", file: "IMG_Sailor_20190323_164357_processed.jpg"},
 {name : "Servers.com", file: "IMG_Servers.com_20190323_164621_processed.jpg"},
 {name : "Shark", file: "IMG_Shark_20190323_165730_processed.jpg"},
 {name : "Snowman", file: "IMG_Snowman_20190323_155013_processed.jpg"},
 {name : "Succulent", file: "IMG_Succulent_20190323_172611_processed.jpg"},
 {name : "Superhero", file: "IMG_Superhero_20190323_171113_processed.jpg"},
 {name : "Surf", file: "IMG_Surf_20190323_155307_processed.jpg"},
 {name : "Theater", file: "IMG_Theater_20190323_171546_processed.jpg"},
 {name : "Tiger", file: "IMG_Tiger_20190323_165958_processed.jpg"},
 {name : "Total Color", file: "IMG_Total_Color_20190323_165659_processed.jpg"},
 {name : "Truck", file: "IMG_Truck_20190323_172113_processed.jpg"},
 {name : "Turtle", file: "IMG_Turtle_20190323_172349_processed.jpg"},
 {name : "Unicorn", file: "IMG_Unicorn_20190323_173121_processed.jpg"},
 {name : "Vortex", file: "IMG_Vortex_20190323_172156_processed.jpg"},
 {name : "Wild", file: "IMG_Wild_20190323_165203_processed.jpg"},
 {name : "Winter", file: "IMG_Winter_20190323_163654_processed.jpg"}
]

const mMenu = document.querySelector('#mouseMenu');
const sky = document.querySelector('#sky');
var count = 0;
document.querySelector('#mouseMenu').addEventListener('mouseenter', function() {
  AFRAME.utils.entity.setComponentProperty(mMenu, 'material.visible', true);
});

document.querySelector('#mouseMenu').addEventListener('click', function() {
    AFRAME.utils.entity.setComponentProperty(mMenu, 'material.visible', true);
    
    if (count < Object.keys(dict).length) {
      count++;
    }else{
      count = 0;
    }

    AFRAME.utils.entity.setComponentProperty(sky, 'material.src', "images/"+dict[count].file);

    AFRAME.utils.entity.setComponentProperty(mMenu, 'text.value', dict[count].name);

  });

document.querySelector('#mouseMenu').addEventListener('mouseleave', function() {
    AFRAME.utils.entity.setComponentProperty(mMenu, 'material.visible', false);
  });