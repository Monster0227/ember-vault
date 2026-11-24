"""Render the chamber arrangement of 渡灯谣. Requires numpy and ffmpeg (PATH or FFMPEG)."""
from pathlib import Path
import math
import os
import subprocess
import numpy as np

OUT = Path(__file__).resolve().parents[1] / 'dist/assets/music'
SR = 24000
SCALES = {'major': [0,2,4,5,7,9,11], 'dorian': [0,2,3,5,7,9,10],
          'minor': [0,2,3,5,7,8,10], 'mix': [0,2,4,5,7,9,10], 'phrygian': [0,1,3,5,7,8,10]}

# Bars are written in scale degrees; / gives a note its length in beats and _ is a rest.
# The opening leap and the two short answering notes belong to the child's lamp signal.
CUES = {
    'quay-bell': (62,'major',74,3,'felt',[0,3,5,2,3,0,4,0],[
        '0/.75 4/1.5 _/.75','_/.5 3 2/.5 0','5/2 4/.5 2/.5','_ 2/1.5 _/.5',
        '3/.5 4/.5 7/2','6 4/1.5 _/.5','1/1.5 _/.5 -1','0/2 _']),
    'quay-procession': (62,'major',78,3,'flute',[0,3,5,4,0,3,1,0],[
        '_/.5 4/.5 7/1.5 _/.5','_/.5 6/.5 4/1.5 _/.5','5 7/.5 9/1.5','7/2.5 _/.5',
        '_ 4/.5 7/1.5','6/1.5 _/.5 3','2/.5 4/.5 1','0/1.5 _/1.5']),
    'quay-warden': (62,'phrygian',62,4,'cello',[0,1,5,0],[
        '-3/1.5 _/.5 1/2','1/2.5 0/.5 _','_ -2/2 1','0/2.5 _/1.5']),
    # A single cue covers the furnace, shaft and awakening; its low phrase opens into a high piano answer.
    'quay-furnace': (62,'dorian',77,3,'cello',[0,1,5,4,0,3,5,4,3,0,4,0],[
        '4/1.5 3/.5 0','1/2 _','2/.5 0/.5 -2/1.5 _/.5','-3/2 _',
        '-7/2.5 _/.5','_ 0/.5 2/.5 3','5/1.5 _/.5 2','1/2 _',
        '3 4/.5 7/1.5','6/1.5 4/.5 _','2/1.5 1/.5 -1','0/2 _'])
}

# Each biome has a different pulse, ornament, register and answering instrument.
# The second half moves the first phrase into another voice and develops the second phrase.
MAPS = {
    'menu': (62,'major',80,3,'lute',[0,3,5,4,0,2,3,4,5,3,0,6,1,3,4,0],[
        '0/.5 4/.5 2/1.5 3/.5','4/2 _','6/1.5 5/.5 4','2/2 1','0 4 7','9/.5 8/.5 7/2','5/.5 4/.5 3/2','4/2 _',
        '7/1.5 9/.5 8','7/.5 6/.5 5/2','4/2 2','1/.5 2/.5 4/2','5/1.5 3/.5 1','3/.5 4/.5 5 2','1 4 1','0/2 _']),
    'rest': (60,'major',72,3,'felt',[0,2,5,3,0,6,1,4,5,3,2,4,0,5,4,0],[
        '4/1.5 2/.5 0','2/2 _','5/.5 4/.5 2 0','3/2 2','4/.5 7/.5 6/2','4/1.5 2/.5 1','2 3 5','4/2 _',
        '7/.5 8/.5 9/2','7/1.5 5/.5 3','4/2 2','1/.5 4/.5 2/2','0 2 4','5/1.5 2/.5 0','1/2 -1','0/2 _']),
    'prison': (62,'dorian',78,4,'cello',[0,3,5,4,0,2,6,4,3,5,1,4,0,6,4,0],[
        '_/.5 0 4/1.5 3/.5 2/.5','_ 3/.5 2/.5 0/2','5/1.5 4/.5 _ 2','-1/2.5 _/1.5',
        '_/.5 -3/.5 0 2/2','4/1.5 2/.5 6/1.5 _/.5','3/.5 4/.5 1/2 _','4/2 _/2',
        '7/1.5 _/.5 4 6','5/.5 6/.5 9/2 7','8/2 _ 4/.5 1/.5','2/1.5 1/.5 -1/2',
        '_ 0/.5 4/.5 7/2','_/.5 5/1.5 2 0','1 4/1.5 -1/.5 _','0/2.5 _/1.5']),
    'sewers': (60,'dorian',76,3,'flute',[0,6,3,0,5,3,1,4,3,5,6,2,0,3,4,0],[
        '_/.5 4/.5 5/.5 4/.5 2','1/2 _','0/.5 2/.5 4/1.5 3/.5','2/3','_ 5/.5 6/.5 7','4/1.5 2/.5 3','1/.5 2/.5 4 1','-1/2 _',
        '5/2 7','9/.5 8/.5 7/2','6/.5 7/.5 4/1.5 2/.5','4/2 _','0/1.5 4/.5 2','3/.5 2/.5 1/2','4/1.5 1/.5 -1','0/2 _']),
    'ramparts': (65,'mix',103,3,'reed',[0,4,6,3,0,5,3,4,5,3,0,6,3,6,4,0],[
        '0/.5 4/.5 7/1.5 6/.5','4 2 4','6/.5 6/.5 4/.5 2/.5 1','3/2 _','4/.5 5/.5 7 9','8/1.5 7/.5 5','3/.5 4/.5 1/2','4/2 2',
        '5 7/.5 8/.5 9','7/1.5 5/.5 3','4/.5 5/.5 7/2','6/2 _','3/.5 4/.5 5 7','6/.5 4/.5 2/2','1/1.5 4/.5 -1','0/2 _']),
    'ossuary': (57,'minor',66,4,'felt',[0,5,2,6,3,5,4,0,2,3,6,4,5,1,4,0],[
        '4/2 _/.5 2/.5 0','-2/3 _','2/.5 4/.5 5/2 4','1/2.5 _/1.5','3/1.5 2/.5 1/2','0/2 -2 0','4/.5 3/.5 1/2 -1','0/3 _',
        '7/2.5 6/.5 4','5/2 _ 5','6/.5 7/.5 4/2 1','-1/3 _','2/2 5 4','3/.5 2/.5 1/2 0','1 4 -1/2','0/3 _']),
    'tower': (64,'dorian',108,4,'dulcimer',[0,1,3,4,5,3,6,4,0,5,3,4,1,6,4,0],[
        '0/.5 4/.5 7/.5 _/.5 6 4','1/.5 2/.5 3 5/1.5 4/.5','3 5/.5 7/.5 9 7','4/2 _/.5 2/.5 1','5/.5 7/.5 9/.5 8/.5 7/2','6 5/.5 4/.5 3/2','6/.5 7/.5 4 2 1','4/3 _',
        '7/.5 9/.5 11/2 9','8/.5 7/.5 5 7/2','3/.5 5/.5 7/1.5 5/.5 3','4 2/.5 1/.5 -1/2','1/.5 3/.5 5 8/2','6/1.5 4/.5 2/2','4/.5 3/.5 1/2 -1','0/3 _'])
}

# The jail keys answer after three beats; the standard-bearer has a dotted march.
# The mother and the warden get longer bowed notes. Both phases have their own composed B phrase.
BATTLES = {
    'lock': (55,'dorian',88,5,'lute',[0,0,3,1,0,5,4,0],[
        '0/1.5 _/.5 -3 4/2','_ 4/.5 3/.5 1/2 _','3 -2 0/2 2','1/3 _/2',
        '_/.5 0/.5 2 4/.5 5/.5 7/2','5/2 _ 2 3','4/.5 3/.5 1/2 -1 _','0/3 _/2']),
    'lock2': (55,'dorian',101,5,'cello',[0,3,1,4,0,5,6,0],[
        '0/.75 2/.25 4 7/1.5 _/.5 6','5/1.5 3/.5 2 _ 0','1/.5 3/.5 5/2 4 2','4/3 _ 1',
        '_/.5 4/.5 7/1.5 9/.5 7/2','5 3/1.5 2/.5 _ 0','6 4/.5 3/.5 1/2 -1','0/3.5 _/1.5']),
    'brood': (58,'phrygian',64,3,'flute',[0,1,3,0,5,1,4,0],[
        '_ 4/.5 5/1.5','1/2.5 _/.5','3/.5 5/.5 6/1.5 5/.5','4/2 _',
        '5/1.5 _/.5 2','1/.5 3/.5 5/2','4/1.5 1/.5 _','0/2 _']),
    'brood2': (58,'phrygian',77,3,'strings',[0,1,5,3,1,3,4,0],[
        '7/1.5 5/.5 4','_/.5 5/.5 8/2','6/.5 5/.5 2/1.5 _/.5','3/2 1',
        '1/.5 3/.5 5/.5 8/1.5','6 5 3','4/1.5 1/.5 -1','0/2 _']),
    'standard': (60,'mix',94,4,'reed',[0,6,3,4,5,3,4,0],[
        '0/.75 2/.25 4/2 _','6/1.5 4/.5 2 _','3/.75 5/.25 7/2 5','4/2.5 _/1.5',
        '5 7/.75 8/.25 9/2','7/1.5 5/.5 3/2','4 1/.5 2/.5 -1/2','0/3 _']),
    'standard2': (60,'mix',107,4,'strings',[0,3,6,4,5,3,4,0],[
        '_/.5 4/.5 7/.75 6/.25 4/1.5 2/.5','3 5/.5 7/.5 9/2','6/.5 7/.5 4 2/2','4/2 _ 1',
        '5/.75 7/.25 9/.75 8/.25 7/2','5 3 5/.5 4/.5 3','1/.5 4/.5 2 -1/2','0/2.5 _/1.5']),
    'epic-boss': (55,'minor',70,4,'cello',[0,5,3,4,0,1,4,0],[
        '-3/2 _ 0','2/1.5 0/.5 -2/2','3/2 _/.5 2/.5 1','-1/3 _',
        '_ 0/.75 4/.25 7/2','5/1.5 3/.5 1/2','4/2 1 -1','0/3 _']),
    'warden2': (55,'minor',83,4,'felt',[0,3,5,4,0,5,4,0],[
        '0 4/.5 7/1.5 6','5/2 3/.5 2/.5 1','_/.5 5/.5 7 9/2','7/1.5 4/.5 _/2',
        '0/.75 2/.25 4 7/.75 9/.25 11','9/1.5 7/.5 5/2','4/1.5 3/.5 1 -1','0/3 _'])
}
INTERLUDES = {
    'furnace': (65,'major',76,3,'lute',[0,3,5,4,0,3,4,0],[
        '0 2/.5 4/1.5','3/2 2','5 4/.5 2/.5 _','1/2 _','_/.5 0/.5 4 7','5/2 3','2/.5 4/.5 1','0/2 _']),
    'arena': (55,'dorian',60,4,'felt',[0,3,1,0],[
        '-7/2 _/2','_ -2/.5 0/1.5 _','1/2 _ 4','-3/1.5 _/2.5']),
    'ending': (62,'major',70,3,'flute',[0,3,5,4,3,0,4,0],[
        '_/.5 0/.5 4/1.5 2/.5','3 2/.5 0/1.5','5/1.5 7/.5 9','7/2 4',
        '5/.5 4/.5 3 2','4/1.5 _/.5 2','1 4/.5 -1/1.5','0/2 _'])
}

def notes(bar):
    offset=0
    for token in bar.split():
        value, _, length=token.partition('/')
        length=float(length or 1)
        if value!='_': yield offset,int(value),length
        offset+=length

def render(name,score):
    midi,mode,bpm,meter,lead,roots,bars=score
    assert len(bars)==len(roots)
    region=name in MAPS
    battle=name in BATTLES
    # Explore, develop, return in a second instrument. Encounters use a shorter written A/B form.
    order=list(range(len(bars)))+(list(range(8)) if region else list(range(4,8)) if battle else [])
    beat=60/bpm
    # A small ritardando at each cadence gives the passage a pulse without gridlocked downbeats.
    bar_stretch=[(.985,.99,.975,1.05)[i%4] for i in range(len(order))]
    starts=np.concatenate(([0.],np.cumsum(bar_stretch)*meter*beat))
    samples=round(starts[-1]*SR)
    mix=np.zeros((samples,2),dtype=np.float32)
    rng=np.random.default_rng(5719+sum(map(ord,name)))
    def place(sig,at,pan):
        bar=min(len(order)-1,int(at//meter))
        seconds=starts[bar]+(at-bar*meter)*beat*bar_stretch[bar]
        idx=round(seconds*SR)%samples; front=min(len(sig),samples-idx)
        for channel,gain in enumerate((math.sqrt((1-pan)/2),math.sqrt((1+pan)/2))):
            mix[idx:idx+front,channel]+=sig[:front]*gain
            if front<len(sig):mix[:len(sig)-front,channel]+=sig[front:]*gain
    def tone(at,degree,beats,kind,volume,pan=0):
        semitone=midi+12*(degree//7)+SCALES[mode][degree%7]
        freq=440*2**((semitone-69)/12)
        length=beats*beat
        pluck=kind in ('lute','felt','dulcimer','water')
        tail=.45 if pluck else .23
        t=np.arange(round((length+tail)*SR))/SR
        angle=2*np.pi*freq*t
        if pluck:
            # A struck string has inharmonic partials and a second detuned course.
            brightness={'lute':.43,'felt':.22,'dulcimer':.49,'water':.19}[kind]
            sig=np.zeros_like(t)
            for k in range(1,7):
                if freq*k>SR*.44:break
                a=(1 if k==1 else brightness/(k**1.16))
                partial=angle*k*(1+.00016*k*k)
                sig+=a*(np.sin(partial)+.19*np.sin(partial*1.0025+.2))*np.exp(-t*(1.4+.69*k))
            if kind=='water':sig+=.21*np.sin(angle*2.706)*np.exp(-t*4)
            env=np.minimum(1,t/.006)*np.exp(-np.maximum(0,t-length)/.12)
        else:
            attack={'flute':.087,'cello':.13,'strings':.16,'reed':.085,'bass':.047,'air':.26}[kind]
            vib={'flute':.006,'reed':.003,'cello':.005,'strings':.004,'bass':0,'air':.001}[kind]
            phase=angle+vib*freq/5*np.sin(2*np.pi*(4.8+rng.uniform(-.3,.3))*t)*np.minimum(t/.23,1)
            amps={'flute':[.93,.12,.15,.03],'reed':[.75,.14,.24,.04,.11],
                  'cello':[.63,.42,.20,.09,.11,.055],'strings':[.64,.31,.22,.15,.085],
                  'bass':[.78,.25,.10],'air':[.62,.12,.04]}[kind]
            sig=sum(a*np.sin(phase*k+.11*k) for k,a in enumerate(amps,1) if k*freq<SR*.43)
            if kind in ('strings','air','cello'):sig=.75*sig+.25*np.sin(phase*1.003-.3)
            breath=rng.standard_normal(len(t))
            sig+=.007*(breath-np.roll(breath,1))*np.exp(-t*12)
            env=np.minimum(1,t/attack)**1.4*np.exp(-np.maximum(0,t-length)/.069)
            env*=.84+.16*np.sin(np.pi*np.minimum(t/max(length,.1),1))**2
        place(sig*env*volume*rng.uniform(.94,1.05),at,pan)
    def tap(at,kind,volume):
        t=np.arange(int(.28*SR))/SR
        n=rng.standard_normal(len(t))
        if kind=='skin':sig=(np.sin(2*np.pi*(79*t+.8*(1-np.exp(-26*t))))+.18*n*np.exp(-t*45))*np.exp(-t*22)
        else:sig=(.28*(n-np.roll(n,1))+.27*np.sin(2*np.pi*360*t))*np.exp(-t*(52 if kind=='rim' else 74))
        place(sig*np.minimum(1,t/.003)*volume,at,-.26 if kind=='rim' else .16)
    answer={'lute':'flute','flute':'lute','cello':'flute','reed':'strings','felt':'cello','dulcimer':'reed','strings':'dulcimer'}[lead]
    for number,index in enumerate(order):
        start=number*meter; phrase=number%4
        middle=region and 8<=number<16
        reprise=region and number>=16
        chord=roots[index]
        quiet=name in ('ossuary','quay-bell','quay-procession','menu','rest','ending','arena')
        urgent=name in ('tower','ramparts') or battle
        opening=name.startswith('quay-')
        # Let one instrument finish speaking before the next section enters.
        exposed=phrase==3 or (quiet and phrase==0) or (opening and number<2)
        swell=(.77,.93,1.05,.68)[phrase]
        melody_voice=answer if middle or (battle and number>=8) else lead
        if name=='quay-furnace' and index>=4:melody_voice='felt' if index<8 else 'flute'
        for step,p,duration in notes(bars[index]):
            assert step+duration<=meter+.001,(name,index)
            accent=1 if step<.6 else .90 if duration<1 else .98
            tone(start+step+.012,p,duration*(.76 if duration<1.1 else .89),
                 melody_voice,.26*swell*accent,-.12 if middle else .10)
        # In a five-beat fight the key-ring answers on beat four. Other meters displace
        # the bass into the phrase or let the melody spend one bar entirely alone.
        if not exposed or (battle and phrase==0):
            bass_at=0 if urgent or phrase==1 else meter*.24
            tone(start+bass_at+.019,chord-14,meter*(.38 if urgent else .57),'bass',.18*swell,-.11)
            if urgent and phrase==2:tone(start+meter*.69,chord-10,meter*.19,'bass',.095,.10)
        if not exposed and (middle or phrase==1 or battle):
            for k,p in enumerate([chord-7,chord-3]):
                tone(start+.12+k*.069,p,meter*.66,'air',.052*swell,(-.57,.52)[k])
        if not exposed:
            # Changing figures avoid an unbroken arpeggio beneath every phrase.
            figures=[[(.17,2),(.69,4)],[(.02,0),(.42,4),(.77,2)],[(.33,4),(.57,2)]]
            for k,(frac,p) in enumerate(figures[phrase]):
                if quiet and k==1:continue
                tone(start+frac*meter,chord-7+p,.53,'water' if name=='sewers' else 'lute',
                     (.098 if urgent else .078)*swell,(-.43,.40)[k%2])
        if (reprise or (battle and number>=4)) and phrase in (1,2):
            tone(start+meter*.53,chord+4,.50,answer,.095,-.46)
            if phrase==2:tone(start+meter*.77,chord+2,.49,answer,.075,-.42)
        if urgent and not exposed:
            tap(start+(0 if phrase!=1 else .5),'skin',.11 if battle else .072)
            if phrase==2:tap(start+(3 if meter==5 else meter*.63),'rim',.077)
        elif region and not quiet and phrase==2 and number%8<4:
            tap(start+meter*.52,'skin',.068)
    wet=mix.copy()
    for delay,gain in [(.073,.115),(.137,.092),(.231,.067),(.379,.047),(.533,.029)]:
        wet+=np.roll(mix[:,::-1],int(delay*SR),axis=0)*gain
    rms_target=.084 if opening or quiet else .092 if battle else .089
    wet*=min(.66/np.max(abs(wet)),rms_target/np.sqrt(np.mean(wet*wet)))
    dest=OUT/(name+'.mp3')
    subprocess.run([os.getenv('FFMPEG','ffmpeg'),'-loglevel','error','-y','-f','s16le','-ar',str(SR),'-ac','2','-i','pipe:0','-c:a','libmp3lame','-b:a','64k','-write_xing','1',str(dest)],input=(wet*32767).astype('<i2').tobytes(),check=True)
    print(name,round(samples/SR,2),'seconds',dest.stat().st_size,flush=True)

if __name__=='__main__':
    for name,score in {**CUES,**MAPS,**BATTLES,**INTERLUDES}.items():render(name,score)
