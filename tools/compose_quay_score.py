"""Render the original score 渡灯谣. Requires Python, numpy and ffmpeg (on PATH or via FFMPEG)."""
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
    'quay-bell': (62,'major',82,3,'dulcimer',[0,3,5,4,0,3,1,0],[
        '0/.5 4/1.5 2/.5 3/.5','4/2 _  ','6/1.5 5/.5 4','2/2 1','0 4 7','6/.5 5/.5 4/2','3/1.5 2/.5 1','0/2.5 _/.5']),
    'quay-procession': (62,'major',91,3,'flute',[0,3,0,4,5,3,4,0],[
        '4/.5 7/.5 7 6','4/1.5 _/.5 2','4/.5 7/.5 9/1.5 8/.5','7/2 4','5 7/.5 6/.5 5','4/2 2','1/.5 2/.5 4 1','0/2.5 _/.5']),
    'quay-warden': (62,'phrygian',67,4,'cello',[0,1,5,0],[
        '0/1.5 4/.5 1/2','1/.5 1/.5 0/3','-2/2 1 0','-7/3 _']),
    'quay-furnace': (62,'minor',110,3,'strings',[0,5,3,4,0,1,4,0],[
        '4/.5 2/.5 0 -2','3 -2/.5 -1/.5 0','4/.5 3/.5 1/.5 -1/.5 0','-3/2 _','7/.5 5/.5 3 2','1/.5 0/.5 -2 -4','-3/.5 -2/.5 1 -1','0/2 _']),
    'quay-awaken': (62,'dorian',64,3,'felt',[0,3,5,0],[
        '0/1.5 _/.5 4','2/2.5 _/.5','4/.5 7/.5 5/2','0/2.5 _/.5'])
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
    'prison': (62,'dorian',86,4,'cello',[0,3,5,4,0,2,6,4,3,5,1,4,0,6,4,0],[
        '_/.5 0/.5 4/1.5 2/.5 3','4/2 1/.5 2/.5 0','5 4/.5 2/.5 0/2','-1/2 _ 1','0/.5 2/.5 4/.5 5/.5 7/2','6/1.5 4/.5 2/2','3/.5 4/.5 1/2 _','4/3 _',
        '7/2 6 4','5/.5 6/.5 7 9/2','8/1.5 6/.5 4 1','2 1/.5 0/.5 -1/2','0/1.5 4/.5 7/2','5/2 2/.5 1/.5 0','1/.5 2/.5 4 1/2','0/3 _']),
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
    # 24 bars: first verse, bridge, and a reduced return with a countermelody.
    order=list(range(len(bars)))+(list(range(8)) if region else [])
    beat=60/bpm
    samples=round(len(order)*meter*beat*SR)
    mix=np.zeros((samples,2),dtype=np.float32)
    rng=np.random.default_rng(5719+sum(map(ord,name)))
    def place(sig,at,pan):
        idx=round(at*beat*SR)%samples; front=min(len(sig),samples-idx)
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
            brightness={'lute':.54,'felt':.29,'dulcimer':.63,'water':.24}[kind]
            sig=np.zeros_like(t)
            for k in range(1,7):
                if freq*k>SR*.44:break
                a=(1 if k==1 else brightness/(k**1.16))
                partial=angle*k*(1+.00016*k*k)
                sig+=a*(np.sin(partial)+.19*np.sin(partial*1.0025+.2))*np.exp(-t*(1.4+.69*k))
            if kind=='water':sig+=.21*np.sin(angle*2.706)*np.exp(-t*4)
            env=np.minimum(1,t/.006)*np.exp(-np.maximum(0,t-length)/.12)
        else:
            attack={'flute':.065,'cello':.10,'strings':.12,'reed':.058,'bass':.026,'air':.21}[kind]
            vib={'flute':.006,'reed':.003,'cello':.005,'strings':.004,'bass':0,'air':.001}[kind]
            phase=angle+vib*freq/5*np.sin(2*np.pi*(4.8+rng.uniform(-.3,.3))*t)*np.minimum(t/.23,1)
            amps={'flute':[.93,.12,.15,.03],'reed':[.75,.14,.24,.04,.11],
                  'cello':[.63,.42,.20,.09,.11,.055],'strings':[.64,.31,.22,.15,.085],
                  'bass':[.78,.25,.10],'air':[.62,.12,.04]}[kind]
            sig=sum(a*np.sin(phase*k+.11*k) for k,a in enumerate(amps,1) if k*freq<SR*.43)
            if kind in ('strings','air','cello'):sig=.75*sig+.25*np.sin(phase*1.003-.3)
            breath=rng.standard_normal(len(t))
            sig+=.018*(breath-np.roll(breath,1))*np.exp(-t*12)
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
        start=number*meter
        middle=region and 8<=number<16
        reprise=region and number>=16
        chord=roots[index]
        quiet=name in ('quay-awaken','ossuary','quay-procession','menu','rest')
        urgent=name in ('quay-furnace','tower','ramparts')
        for step,p,duration in notes(bars[index]):
            assert step+duration<=meter+.001,(name,index)
            tone(start+step+.012,p,duration*(.88 if duration<1.1 else .94),
                 answer if middle else lead,.26 if not quiet else .22,-.15 if middle else .10)
        tone(start+.019,chord-14,meter*(.52 if urgent else .76),'bass',.19,-.11)
        if urgent or (region and index%3==2):tone(start+meter*.71,chord-10,meter*.20,'bass',.12,.08)
        # Spread open voicings across the stereo field; remove the pad in the exposed answer.
        if not (middle and number%3==0):
            for k,p in enumerate([chord-7,chord-3,chord-5]):
                tone(start+.021+k*.046,p,meter*.83,'air',.075 if not quiet else .056,(-.72,.62,-.20)[k])
        step_pattern=[(.48,0),(1.51,4),(2.08,2),(2.75,4)] if meter==3 else [(.53,0),(1.51,4),(2.24,2),(3.52,4)]
        for k,(offset,p) in enumerate(step_pattern):
            if (quiet and k%2) or (middle and k==1) or (not region and not urgent and k>1):continue
            if number%2==1 and k==2:offset+=.16
            tone(start+offset,chord-7+p,.59,'water' if name=='sewers' else 'lute',.12 if urgent else .092,(-.48,.52)[k%2])
        if reprise or (not region and index%4==3):
            # Answer the melodic gaps, including the girl's two-note signal.
            tone(start+meter*.50,chord+4,.46,answer,.115,-.46)
            if index%2==0:tone(start+meter*.72,chord+2,.58,answer,.095,-.46)
        if urgent or (region and not quiet and not middle):
            tap(start,'skin',.145 if urgent else .084)
            tap(start+meter*.54,'rim',.12 if urgent else .065)
            if index%4==3:tap(start+meter-.31,'rim',.085)
    wet=mix.copy()
    for delay,gain in [(.073,.115),(.137,.092),(.231,.067),(.379,.047),(.533,.029)]:
        wet+=np.roll(mix[:,::-1],int(delay*SR),axis=0)*gain
    wet*=min(.84/np.max(abs(wet)),.137/np.sqrt(np.mean(wet*wet)))
    dest=OUT/(name+'.mp3')
    subprocess.run([os.getenv('FFMPEG','ffmpeg'),'-loglevel','error','-y','-f','s16le','-ar',str(SR),'-ac','2','-i','pipe:0','-c:a','libmp3lame','-b:a','64k','-write_xing','1',str(dest)],input=(wet*32767).astype('<i2').tobytes(),check=True)
    print(name,round(samples/SR,2),'seconds',dest.stat().st_size,flush=True)

if __name__=='__main__':
    for name,score in {**CUES,**MAPS}.items():render(name,score)
