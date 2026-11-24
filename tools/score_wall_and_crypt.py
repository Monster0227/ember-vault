"""Original exploration music for the ramparts and the ossuary, in scale degrees."""

# The ramparts pulse is the eighth note: six pulses, with a stride on one and four.
# The crypt counts five slow quarter notes and often leaves the whole fifth beat empty.
SCORES = {
    'ramparts': (64, 'mix', 186, 6, 'reed',
        [0, 6, 3, 0, 5, 1, 4, 4, 3, 3, 6, 1, 5, 6, 4, 0], [
            '_/.5 2/.5 3 4/2 2 0', '1/2.5 _/.5 -1 1 2',
            '3/1.5 5/.5 6 5/2 3', '2/2 0 _/3',
            '2 4 5 7/2 5', '6/2.5 4/.5 3/1.5 1/.5 _',
            '_ 1/.5 2/.5 4 6/2 5', '4/3 _/2 -1',
            '0/.5 3/.5 5/2 7/1.5 9/.5 8', '7/2 5 _/.5 3/.5 5 6',
            '8/1.5 6/.5 4 3 1/2', '1/2.5 _/.5 _/3',
            '-2 0 2 4/2 3', '1/.5 2/.5 4 6 3/1.5 1/.5 _',
            '_ 4 2 1/1.5 -1/.5 1', '0/3.5 _/2.5',
        ]),
    'ossuary': (59, 'minor', 69, 5, 'cello',
        [0, 0, 5, 2, 3, 3, 6, 4, 5, 2, 3, 1, 0, 6, 4, 0], [
            '_ 2/3 1', '0/3.5 _/1.5',
            '_/2 -2/2 0', '2/2.5 4/.5 _/2',
            '5/3 3/1.5 _/.5', '_ 2/2.5 0/1.5',
            '-1/3.5 _/1.5', '_/5',
            '_/.5 2/1.5 5/3', '7/2.5 6/.5 4/2',
            '3/3 _ 0', '1/2.5 _/2.5',
            '_/1.5 2/2.5 1', '-1/3 _/2',
            '_ 1/2 -3/2', '0/3 _/2',
        ]),
}

# Offsets are written in eighth notes. Empty bars let the reed or its answering flute
# carry across the absent downbeat. The low fifth often arrives after the second footfall.
_WALL_FOOT = (
    ((0, 0, 1.2), (3.2, 4, .65)), ((0, 0, 1.5),),
    ((.12, 0, .9), (3, 2, 1)), (),
    ((0, 0, 1.65), (3.15, 4, .7)), ((1, 0, 1.4),),
    ((0, 0, 1), (4, 4, .9)), ((0, 0, 1.8),),
    ((0, 0, 1.15), (3, 4, 1.1)), ((.85, 2, .8), (3.15, 0, 1.35)),
    ((0, 0, 1.5), (3.5, 4, .7)), (),
    ((.15, 0, 1.2), (3.10, 2, .65)), ((0, 0, 1.6),),
    ((0, 0, .9), (3.15, 4, .95)), ((0, 0, 2.2),),
)
_WALL_CALLS = {
    1: ((3.55, 6, .8), (4.7, 4, .85)),
    3: ((2.95, 4, .8), (4.1, 2, .65), (5.05, 0, .72)),
    7: ((3.04, 1, 1.3),),
    9: ((.28, 10, 1.3), (2.35, 9, .6)),
    11: ((3.05, 6, .77), (4.15, 5, 1.55)),
    15: ((3.5, 4, .82), (4.63, 2, .9)),
}
_WALL_STEPS = {
    0: (0, 3), 2: (0, 3.5), 4: (0, 3), 5: (3,), 6: (0, 4.5),
    8: (0, 3), 9: (1.5, 3), 10: (0, 3.5), 12: (0, 3), 14: (0,),
}

# These are absolute degrees rather than root-following chords. The low B persists
# under the change in harmony; upper notes ring only in gaps between the bowed phrases.
_CRYPT_UNDERLAY = {
    0: ((.12, -7, 3.7),), 2: ((.35, -7, 3.8),),
    4: ((.16, -4, 3.3),), 6: ((.13, -8, 4.2),),
    8: ((.55, -9, 3.8),), 9: ((1.4, -5, 2.6),),
    10: ((.20, -4, 3.5),), 12: ((.7, -7, 3.5),),
    14: ((.3, -10, 3.8),), 15: ((.16, -7, 3.1),),
}
_CRYPT_DROPS = {
    1: ((3.8, 7, .45),), 3: ((3.45, 4, .6),),
    5: ((.16, 5, .6),), 7: ((.42, 4, .8), (2.91, 1, .65)),
    11: ((2.95, 8, .7),), 13: ((3.38, 6, .6),), 15: ((3.50, 4, .48),),
}


def accompany(name, bar, start, chord, meter, tone, tap):
    """Add one bar. tone and tap receive absolute offsets in the score's beat unit."""
    if name == 'ramparts':
        i = bar % len(_WALL_FOOT)
        for beat, interval, length in _WALL_FOOT[i]:
            tone(start + beat, chord - 14 + interval, length, 'bass', .115, -.12)
        for beat, degree, length in _WALL_CALLS.get(i, ()):
            tone(start + beat, degree, length, 'flute', .092, -.38)
        for beat in _WALL_STEPS.get(i, ()):
            tap(start + beat, 'skin' if beat < 3 else 'rim', .057 if beat < 3 else .036)
        if i in (2, 6, 10, 13):
            tone(start + 2.4, chord - 3, 2.8, 'air', .044, .43)
        return True
    if name == 'ossuary':
        i = bar % len(SCORES['ossuary'][5])
        for beat, degree, length in _CRYPT_UNDERLAY.get(i, ()):
            tone(start + beat, degree, length, 'air', .078, -.27)
        for beat, degree, length in _CRYPT_DROPS.get(i, ()):
            tone(start + beat, degree, length, 'felt', .062, .40)
        if i == 7:
            tone(start + 1.7, -3, 2.6, 'strings', .043, -.47)
        return True
    return False
